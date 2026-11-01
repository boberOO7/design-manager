import { after } from "next/server";
import { z } from "zod";
import { getMetaLeadTarget, metaId } from "@/lib/meta-leads/config";
import { enqueueMetaLeads, processMetaLeadQueue, type MetaLeadEvent } from "@/lib/meta-leads/queue";
import { equalSecret, validMetaSignature } from "@/lib/meta-leads/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.get("hub.mode") !== "subscribe" || !query.has("hub.challenge") ||
    !equalSecret(query.get("hub.verify_token") ?? "", process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(query.get("hub.challenge"), { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

const envelope = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({ id: metaId, changes: z.array(z.object({ field: z.string(), value: z.unknown() })) })),
});
const leadgen = z.object({
  leadgen_id: metaId, page_id: metaId.optional(), form_id: metaId.optional(), ad_id: metaId.optional(),
  created_time: z.number().int().nonnegative().max(253402300799).optional(),
});

export async function POST(request: Request) {
  try {
    const raw = new Uint8Array(await request.arrayBuffer());
    if (!validMetaSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(raw)); }
    catch { return new Response("Invalid payload", { status: 400 }); }
    const parsed = envelope.safeParse(body);
    if (!parsed.success) return new Response("Invalid payload", { status: 400 });
    const { pageId } = getMetaLeadTarget();
    const events: MetaLeadEvent[] = [];
    for (const entry of parsed.data.entry) {
      if (entry.id !== pageId) return new Response("Forbidden page", { status: 403 });
      for (const change of entry.changes) {
        if (change.field !== "leadgen") continue;
        const value = leadgen.safeParse(change.value);
        if (!value.success) return new Response("Invalid leadgen", { status: 400 });
        if (value.data.page_id && value.data.page_id !== pageId) return new Response("Forbidden page", { status: 403 });
        events.push({
          leadgen_id: value.data.leadgen_id, form_id: value.data.form_id, ad_id: value.data.ad_id,
          submitted_at: value.data.created_time === undefined ? undefined : new Date(value.data.created_time * 1000).toISOString(),
        });
      }
    }
    await enqueueMetaLeads(events);
    if (events.length) after(async () => {
      try { await processMetaLeadQueue(); }
      catch { console.error("Meta lead worker failed; durable jobs remain queued."); }
    });
    return new Response("EVENT_RECEIVED", { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("Meta ingestion unavailable", { status: 503 });
  }
}
