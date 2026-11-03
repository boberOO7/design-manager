import { isDeepStrictEqual } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLeadProposalSource } from "@/lib/crm-proposal";
import { proposalCommercialTermsSchema } from "@/lib/proposal-commercial-terms";
import { createProposalSnapshot, proposalFilename, proposalPresentationSchema, proposalSnapshotSchema, resolveProposalDesignVariant } from "@/lib/finance-proposal";
import { renderProposalPdf } from "@/lib/finance-proposal-pdf";
import { getKyivDateOnly } from "@/lib/validation/project";

export const runtime = "nodejs";
export const maxDuration = 60;
const bodySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("draft"), terms: proposalCommercialTermsSchema }),
  z.object({ intent: z.enum(["preview", "generate"]), requestId: z.uuid(), source: proposalSnapshotSchema, presentation: proposalPresentationSchema }),
]);
const failure = (code: "error" | "changed", status = 400) => NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });

async function context(studioId: string, leadId: string) {
  const client = await createClient();
  const [lead, studio, currencies, history] = await Promise.all([
    client.from("crm_leads").select("*").eq("studio_id", studioId).eq("id", leadId).maybeSingle(),
    client.from("studios").select("website,email,phone,business_address,contact_person").eq("id", studioId).single(),
    client.from("finance_currencies").select("code,minor_units").order("code"),
    client.from("crm_lead_proposals").select("id,revision,created_at,snapshot,request_id").eq("studio_id", studioId).eq("lead_id", leadId).order("revision", { ascending: false }),
  ]);
  if (lead.error || studio.error || currencies.error || history.error) throw new Error("Unable to load lead proposal context");
  if (!lead.data) return null;
  return { client, lead: lead.data, currencies: currencies.data, history: history.data,
    contacts: { website: studio.data.website ?? "", email: studio.data.email ?? "", phone: studio.data.phone ?? "",
      businessAddress: studio.data.business_address ?? "", contactPerson: studio.data.contact_person ?? "" } };
}
type Context = NonNullable<Awaited<ReturnType<typeof context>>>;
function sourceFor(data: Context, terms: z.infer<typeof proposalCommercialTermsSchema>) {
  const currency = data.currencies.find(item => item.code === terms.currency);
  if (!currency) throw new Error("currency");
  const first = data.history.at(-1);
  if (first && proposalSnapshotSchema.parse(first.snapshot).projectNumber !== terms.number) throw new Error("number");
  return createLeadProposalSource(data.lead, terms, currency, data.contacts, (data.history[0]?.revision ?? 0) + 1, getKyivDateOnly());
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) return failure("error");
  const admin = await getActiveStudioAdmin();
  if (!admin) return failure("error", 403);
  try {
    const data = await context(admin.studio_id, leadId);
    if (!data) return failure("error", 404);
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      if (!z.uuid().safeParse(id).success) return failure("error");
      const saved = await data.client.from("crm_lead_proposals").select("pdf,snapshot").eq("studio_id", admin.studio_id).eq("lead_id", leadId).eq("id", id).maybeSingle();
      if (saved.error) return failure("error", 500);
      if (!saved.data) return failure("error", 404);
      const snapshot = proposalSnapshotSchema.parse(saved.data.snapshot);
      return new NextResponse(new Uint8Array(Buffer.from(saved.data.pdf.slice(2), "hex")), { headers: {
        "Content-Type": "application/pdf", "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="${proposalFilename(snapshot)}"`, "Cache-Control": "private, no-store",
      } });
    }
    const latest = data.history[0] ? proposalSnapshotSchema.parse(data.history[0].snapshot) : null;
    const terms = latest?.schemaVersion === 3 ? latest.commercialTerms : null;
    return NextResponse.json({ source: terms && request.nextUrl.searchParams.has("draft") ? sourceFor(data, terms) : null, error: null,
      history: data.history.map(item => { const snapshot = proposalSnapshotSchema.parse(item.snapshot); return {
        id: item.id, revision: item.revision, created_at: item.created_at, designVariant: resolveProposalDesignVariant(snapshot), showPercentages: snapshot.showPercentages ?? true,
      }; }),
      leadContext: { title: data.lead.company || data.lead.client_name, area: data.lead.approximate_area?.toString() ?? "", currency: data.lead.budget_currency ?? "", terms, currencies: data.currencies },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Unable to load lead proposal", error); return failure("error", 500); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) return failure("error");
  const admin = await getActiveStudioAdmin();
  if (!admin) return failure("error", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("error");
  try {
    const data = await context(admin.studio_id, leadId);
    if (!data) return failure("error", 404);
    if (parsed.data.intent === "draft") {
      try { return NextResponse.json({ source: sourceFor(data, parsed.data.terms) }, { headers: { "Cache-Control": "no-store" } }); }
      catch { return failure("error"); }
    }
    const { source, presentation, intent, requestId } = parsed.data;
    if (source.schemaVersion !== 3 || source.leadId !== leadId || presentation.stageNotes?.some(note => !source.rows.some(row => row.id === note.id))) return failure("error");
    const snapshot = createProposalSnapshot(source, presentation);
    if (intent === "generate") {
      const old = await data.client.from("crm_lead_proposals").select("id,lead_id,snapshot").eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
      if (old.error) return failure("error", 500);
      if (old.data) return old.data.lead_id === leadId && isDeepStrictEqual(proposalSnapshotSchema.parse(old.data.snapshot), snapshot)
        ? NextResponse.json({ id: old.data.id }) : failure("changed", 409);
    }
    let current;
    try { current = sourceFor(data, source.commercialTerms); } catch { return failure("error"); }
    if (!isDeepStrictEqual(current, source)) return failure("changed", 409);
    const pdf = await renderProposalPdf(snapshot);
    if (intent === "preview") return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
    const saved = await createAdminClient().rpc("save_crm_lead_proposal", { p_studio_id: admin.studio_id, p_lead_id: leadId,
      p_request_id: requestId, p_source: source, p_snapshot: snapshot, p_pdf: pdf.toString("base64"), p_actor_id: admin.authenticatedUserId });
    if (saved.error) return failure(saved.error.message === "finance_version_conflict" ? "changed" : "error", saved.error.message === "finance_version_conflict" ? 409 : 400);
    return NextResponse.json({ id: saved.data });
  } catch (error) { console.error("Unable to render lead proposal", error); return failure("error", 500); }
}
