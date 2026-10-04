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
const bodySchema = z.object({ intent: z.enum(["preview", "generate"]), requestId: z.uuid(), orderId: z.uuid().optional(), source: proposalSnapshotSchema, presentation: proposalPresentationSchema })
  .refine(({ source, presentation }) => !presentation.stageNotes?.some(note => !source.rows.some(row => row.id === note.id)), { path: ["presentation", "stageNotes"], message: "Unknown proposal stage" });
const failure = (code: string, status = 400) => NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
const errorCode = (message: string) => message === "finance_proposal_number_required" ? "numberRequired" : message === "finance_project_agreement_required" ? "agreementRequired" : message === "finance_version_conflict" ? "changed" : "error";

async function resolveOrder(client: Awaited<ReturnType<typeof createClient>>, studioId: string, projectId: string, orderId: string | null) {
  const query = client.from("finance_project_orders").select("id,status").eq("studio_id", studioId).eq("project_id", projectId);
  return (orderId ? query.eq("id", orderId) : query.eq("is_default", true).neq("status", "discarded")).maybeSingle();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return failure("error");
  const admin = await getActiveStudioAdmin();
  if (!admin) return failure("error", 403);
  const client = await createClient();
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (orderId && !z.uuid().safeParse(orderId).success) return failure("error");
  const order = await resolveOrder(client, admin.studio_id, projectId, orderId);
  if (order.error) return failure("error", 500);
  if (!order.data) return failure("agreementRequired", 404);
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!z.uuid().safeParse(id).success) return failure("error");
    const { data, error } = await client.from("finance_project_proposals").select("pdf,snapshot").eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("order_id", order.data.id).eq("id", id).maybeSingle();
    if (error) return failure("error", 500);
    if (!data) return failure("error", 404);
    const snapshot = proposalSnapshotSchema.parse(data.snapshot);
    const pdf = Buffer.from(data.pdf.slice(2), "hex");
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="${proposalFilename(snapshot)}"`, "Cache-Control": "private, no-store" } });
  }
  const saved = await client.from("finance_project_proposals").select("id,revision,created_at,snapshot").eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("order_id", order.data.id).order("revision", { ascending: false });
  if (saved.error) return failure("error", 500);
  const history = saved.data.map(({ snapshot, ...revision }) => ({ ...revision, designVariant: resolveProposalDesignVariant(proposalSnapshotSchema.parse(snapshot)) }));
  // Existing snapshots open without preparing a draft; only an explicit revision does that.
  if (history.length && !request.nextUrl.searchParams.has("draft")) {
    return NextResponse.json({source:null,error:null,history},{headers:{"Cache-Control":"no-store"}});
  }
  const source = await client.rpc("get_finance_proposal_source", { p_studio_id: admin.studio_id, p_project_id: projectId, p_order_id: order.data.id });
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
  const queryOrderId = request.nextUrl.searchParams.get("orderId");
  if ((queryOrderId && !z.uuid().safeParse(queryOrderId).success) ||
    (parsed.data.orderId && queryOrderId && parsed.data.orderId !== queryOrderId)) return failure("error");
  const order = await resolveOrder(client, admin.studio_id, projectId, parsed.data.orderId ?? queryOrderId);
  if (order.error) return failure("error", 500);
  if (!order.data ||
    (source.schemaVersion === 2 && source.order.id !== order.data.id)) return failure("error");
  const snapshot = createProposalSnapshot(source, presentation);
  if (intent === "generate") {
    const { data, error } = await client.from("finance_project_proposals").select("id,snapshot,project_id,order_id").eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
    if (error) return failure("error", 500);
    if (data) {
      const stored = proposalSnapshotSchema.parse(data.snapshot);
      return data.project_id === projectId && data.order_id === order.data.id && isDeepStrictEqual({ ...stored, designVariant: resolveProposalDesignVariant(stored) }, snapshot) ? NextResponse.json({ id: data.id }) : failure("changed", 409);
    }
  }
  if (order.data.status === "discarded") return failure("agreementRequired");
  const current = await client.rpc("get_finance_proposal_source", { p_studio_id: admin.studio_id, p_project_id: projectId, p_order_id: order.data.id });
  if (current.error) return failure(errorCode(current.error.message));
  if (!isDeepStrictEqual(proposalSnapshotSchema.parse(current.data), source)) return failure("changed", 409);
  try {
    const pdf = await renderProposalPdf(snapshot);
    if (intent === "preview") return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
    const saved = await createAdminClient().rpc("save_finance_project_proposal", { p_studio_id: admin.studio_id, p_project_id: projectId, p_order_id: order.data.id, p_request_id: requestId, p_source: source, p_presentation: presentation, p_pdf: pdf.toString("base64"), p_actor_id: admin.authenticatedUserId });
    if (saved.error) return failure(errorCode(saved.error.message), saved.error.message === "finance_version_conflict" ? 409 : 400);
    return NextResponse.json({ id: saved.data });
  } catch (error) {
    console.error("Unable to render proposal PDF", error);
    return failure("error", 500);
  }
}
