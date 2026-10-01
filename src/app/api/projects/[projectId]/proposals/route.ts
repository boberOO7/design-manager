import { isDeepStrictEqual } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createProposalSnapshot, proposalFilename, proposalPresentationSchema, proposalSnapshotSchema, resolveProposalDesignVariant, DEFAULT_PROPOSAL_DESIGN_VARIANT } from "@/lib/finance-proposal";
import { renderProposalPdf } from "@/lib/finance-proposal-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;
const bodySchema = z.object({ intent: z.enum(["preview", "generate"]), requestId: z.uuid(), source: proposalSnapshotSchema, presentation: proposalPresentationSchema });
const failure = (code: string, status = 400) => NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
const errorCode = (message: string) => message === "finance_proposal_number_required" ? "numberRequired" : message === "finance_project_agreement_required" ? "agreementRequired" : message === "finance_version_conflict" ? "changed" : "error";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return failure("error");
  const admin = await getActiveStudioAdmin();
  if (!admin) return failure("error", 403);
  const client = await createClient();
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!z.uuid().safeParse(id).success) return failure("error");
    const { data, error } = await client.from("finance_project_proposals").select("pdf,snapshot").eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("id", id).maybeSingle();
    if (error) return failure("error", 500);
    if (!data) return failure("error", 404);
    const snapshot = proposalSnapshotSchema.parse(data.snapshot);
    const pdf = Buffer.from(data.pdf.slice(2), "hex");
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="${proposalFilename(snapshot)}"`, "Cache-Control": "private, no-store" } });
  }
  const saved = await client.from("finance_project_proposals").select("id,revision,created_at,snapshot").eq("studio_id", admin.studio_id).eq("project_id", projectId).order("revision", { ascending: false });
  if (saved.error) return failure("error", 500);
  const history = saved.data.map(({ snapshot, ...revision }) => ({ ...revision, designVariant: resolveProposalDesignVariant(proposalSnapshotSchema.parse(snapshot)) }));
  // Existing snapshots open without preparing a draft; only an explicit revision does that.
  if (history.length && !request.nextUrl.searchParams.has("draft")) {
    return NextResponse.json({source:null,error:null,history},{headers:{"Cache-Control":"no-store"}});
  }
  const source = await client.rpc("get_finance_proposal_source", { p_studio_id: admin.studio_id, p_project_id: projectId });
  return NextResponse.json({ source: source.error ? null : proposalSnapshotSchema.parse(source.data), error: source.error ? errorCode(source.error.message) : null, history }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return failure("error");
  const admin = await getActiveStudioAdmin();
  if (!admin) return failure("error", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.source.projectId !== projectId) return failure("error");
  const { source, intent, requestId } = parsed.data;
  const presentation = { ...parsed.data.presentation, designVariant: parsed.data.presentation.designVariant ?? DEFAULT_PROPOSAL_DESIGN_VARIANT };
  const client = await createClient();
  const snapshot = createProposalSnapshot(source, presentation);
  if (intent === "generate") {
    const { data, error } = await client.from("finance_project_proposals").select("id,snapshot").eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
    if (error) return failure("error", 500);
    if (data) {
      const stored = proposalSnapshotSchema.parse(data.snapshot);
      return isDeepStrictEqual({ ...stored, designVariant: resolveProposalDesignVariant(stored) }, snapshot) ? NextResponse.json({ id: data.id }) : failure("changed", 409);
    }
  }
  const current = await client.rpc("get_finance_proposal_source", { p_studio_id: admin.studio_id, p_project_id: projectId });
  if (current.error) return failure(errorCode(current.error.message));
  if (!isDeepStrictEqual(proposalSnapshotSchema.parse(current.data), source)) return failure("changed", 409);
  try {
    const pdf = await renderProposalPdf(snapshot);
    if (intent === "preview") return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
    const saved = await createAdminClient().rpc("save_finance_project_proposal", { p_studio_id: admin.studio_id, p_project_id: projectId, p_request_id: requestId, p_source: source, p_presentation: presentation, p_pdf: pdf.toString("base64"), p_actor_id: admin.authenticatedUserId });
    if (saved.error) return failure(errorCode(saved.error.message), saved.error.message === "finance_version_conflict" ? 409 : 400);
    return NextResponse.json({ id: saved.data });
  } catch (error) {
    console.error("Unable to render proposal PDF", error);
    return failure("error", 500);
  }
}
