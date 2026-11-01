import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";
import { getMetaGraphConfig, metaId } from "./config";

export class MetaLeadError extends Error {
  constructor(readonly code: string, readonly retryable = true) { super(code); }
}

export const metaLeadSchema = z.object({
  id: metaId,
  created_time: z.string().optional(),
  form_id: metaId.optional(),
  ad_id: metaId.optional(),
  ad_name: z.string().optional(),
  adset_id: metaId.optional(),
  adset_name: z.string().optional(),
  campaign_id: metaId.optional(),
  campaign_name: z.string().optional(),
  platform: z.string().optional(),
  is_organic: z.boolean().optional(),
  custom_disclaimer_responses: z.array(z.object({ checkbox_key: z.string(), is_checked: z.union([z.string(), z.boolean()]) })).optional(),
  field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
});
export type MetaLead = z.infer<typeof metaLeadSchema>;

async function graphRequest(path: string, parameters: Record<string, string>) {
  const { version, token, appSecret } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.search = new URLSearchParams({ ...parameters, appsecret_proof: createHmac("sha256", appSecret).update(token).digest("hex") }).toString();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    const body: unknown = await response.json();
    const error = z.object({ error: z.object({ code: z.number().optional() }) }).safeParse(body);
    if (!response.ok || error.success) {
      // Never retain provider messages: they can contain tokens or personal data.
      throw new MetaLeadError(`graph_http_${response.status}_code_${error.success ? error.data.error.code ?? 0 : 0}`);
    }
    return body;
  } catch (error) {
    if (error instanceof MetaLeadError) throw error;
    throw new MetaLeadError("graph_unavailable");
  }
}

export async function fetchMetaLead(leadgenId: string): Promise<MetaLead> {
  metaId.parse(leadgenId);
  const parsed = metaLeadSchema.safeParse(await graphRequest(leadgenId, {
    fields: "id,created_time,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,field_data,platform,is_organic,custom_disclaimer_responses",
  }));
  if (!parsed.success || parsed.data.id !== leadgenId) throw new MetaLeadError("invalid_graph_lead");
  return parsed.data;
}

export async function* listMetaIds(ownerId: string, edge: "leadgen_forms" | "leads") {
  metaId.parse(ownerId);
  let after: string | undefined;
  const seen = new Set<string>();
  do {
    const parsed = z.object({
      data: z.array(z.object({ id: metaId })),
      paging: z.object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() }).optional(),
    }).safeParse(await graphRequest(`${ownerId}/${edge}`, { fields: "id", limit: "100", ...(after ? { after } : {}) }));
    if (!parsed.success) throw new MetaLeadError("invalid_graph_page");
    for (const item of parsed.data.data) yield item.id;
    // Reconstruct Graph requests from cursors; never follow URLs bearing tokens.
    if (!parsed.data.paging?.next) return;
    after = parsed.data.paging.cursors?.after;
    if (!after || seen.has(after)) throw new MetaLeadError("invalid_graph_cursor");
    seen.add(after);
  } while (after);
}
