import { z } from "zod";
export const metaId = z.string().regex(/^[0-9]+$/).max(100);
export const META_BATCH_SIZE = 50;
export const metaLeadSchema = z.object({
  id: metaId, created_time: z.string().optional(), form_id: metaId.optional(),
  ad_id: metaId.optional(), ad_name: z.string().optional(), adset_id: metaId.optional(), adset_name: z.string().optional(),
  campaign_id: metaId.optional(), campaign_name: z.string().optional(), platform: z.string().optional(), is_organic: z.boolean().optional(),
  custom_disclaimer_responses: z.array(z.object({ checkbox_key: z.string(), is_checked: z.union([z.string(), z.boolean()]) })).optional(),
  field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
});
export type MetaLead = z.infer<typeof metaLeadSchema>;
export const metaFormSchema = z.object({
  id: metaId, name: z.string().optional(), status: z.string().optional(), created_time: z.string().optional(),
  leads_count: z.coerce.number().int().nonnegative().nullish(),
});
export const metaJobStateSchema = z.object({
  leadgen_id: metaId, form_id: z.string().nullable(), status: z.enum(["pending", "processing", "completed", "failed", "blocked", "skipped"]),
  crm_lead_id: z.string().nullable(), last_error: z.string().nullable(), updated_at: z.string(),
});
export type MetaJobState = z.infer<typeof metaJobStateSchema>;
export const metaFormSummarySchema = z.object({
  form_id: metaId, name: z.string().nullable(), meta_status: z.string().nullable(), meta_created_at: z.string().nullable(),
  lifetime_leads_count: z.number().nullable(), sync_enabled: z.boolean(), imported: z.number(), pending: z.number(), failed: z.number(),
});
export type MetaFormSummary = z.infer<typeof metaFormSummarySchema>;
export const metaPreviewSchema = z.object({
  id: metaId, submitted_at: z.string().nullable(), client_name: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(),
  field_data: metaLeadSchema.shape.field_data,
  status: z.enum(["not_imported", "crm", "incomplete", "error", "skipped", "pending", "processing"]), reason: z.string().nullable(), eligible: z.boolean(),
});
export type MetaPreview = z.infer<typeof metaPreviewSchema>;
export const metaDiagnosticsSchema = z.object({ enabledForms: z.number(), pending: z.number(), failed: z.number(), lastSuccess: z.string().nullable(), manualAvailable: z.boolean(), graphError: z.string().nullable() });
export const metaResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("forms"), forms: z.array(metaFormSummarySchema), next: z.string().nullable(), diagnostics: metaDiagnosticsSchema }),
  z.object({ kind: z.literal("availability"), count: z.number(), latest: z.string().nullable(), next: z.string().nullable() }),
  z.object({ kind: z.literal("preview"), leads: z.array(metaPreviewSchema), next: z.string().nullable() }),
  z.object({ kind: z.literal("status"), jobs: z.array(metaJobStateSchema) }),
  z.object({ kind: z.literal("plan"), importable: z.array(metaId), existing: z.number(), skipped: z.number() }),
  z.object({ kind: z.literal("saved") }),
]);
export type MetaResponse = z.infer<typeof metaResponseSchema>;
const selectedIds = z.array(metaId).min(1).max(META_BATCH_SIZE);
export const metaMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), formId: metaId, enabled: z.boolean() }),
  z.object({ action: z.literal("exclude"), formId: metaId, leadId: metaId, excluded: z.boolean() }),
  z.object({ action: z.literal("plan"), formId: metaId, leadIds: selectedIds }),
  z.object({ action: z.literal("enqueue"), formId: metaId, leadIds: selectedIds }),
  z.object({ action: z.literal("process"), formId: metaId, leadIds: selectedIds }),
]);
