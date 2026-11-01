import "server-only";

import { z } from "zod";

export const metaId = z.string().regex(/^[0-9]+$/).max(100);

export function getMetaLeadTarget() {
  const result = z.object({ pageId: metaId, studioId: z.uuid() }).safeParse({
    pageId: process.env.META_PAGE_ID,
    studioId: process.env.META_CRM_STUDIO_ID,
  });
  if (!result.success) throw new Error("meta_target_not_configured");
  return result.data;
}

export function getMetaGraphConfig() {
  const result = z.object({
    version: z.string().regex(/^v\d+\.0$/),
    token: z.string().min(1),
    appSecret: z.string().min(1),
  }).safeParse({ version: process.env.META_GRAPH_API_VERSION, token: process.env.META_PAGE_ACCESS_TOKEN, appSecret: process.env.META_APP_SECRET });
  if (!result.success) throw new Error("meta_graph_not_configured");
  return result.data;
}
