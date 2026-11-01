import "server-only";

import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMetaGraphConfig, getMetaLeadTarget } from "./config";
import { metaDiagnosticsSchema, metaFormSummarySchema, metaJobStateSchema, type MetaJobState, type MetaPreview } from "./contracts";
import { fetchMetaFormsPage, fetchMetaAvailabilityPage, fetchMetaPreviewPage, fetchMetaLead, MetaLeadError, type MetaLead } from "./graph";
import { mapMetaLead, metaSubmittedAt } from "./mapping";
import { enqueueMetaLeads } from "./queue";
export class MetaManagementError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}

export async function requireMetaAdmin() {
  const member = await getActiveStudioAdmin();
  if (!member)
    throw new MetaManagementError("permission", 403);
  let target;
  try {
    target = getMetaLeadTarget();
  }
  catch {
    throw new MetaManagementError("not_configured");
  }
  if (member.studio_id !== target.studioId)
    throw new MetaManagementError("permission", 403);
  return { ...target, admin: createAdminClient(), user: await createClient() };
}
type Context = Awaited<ReturnType<typeof requireMetaAdmin>>;

async function form(context: Context, formId: string, enabled = false) {
  const result = await context.admin.from("meta_lead_forms").select("form_id,sync_enabled")
    .eq("page_id", context.pageId).eq("studio_id", context.studioId).eq("form_id", formId).maybeSingle();
  if (result.error)
    throw new MetaManagementError("database_unavailable");
  if (!result.data)
    throw new MetaManagementError("form_not_found", 404);
  if (enabled && !result.data.sync_enabled)
    throw new MetaManagementError("form_disabled", 409);
  return result.data;
}
const summarySchema = metaDiagnosticsSchema.omit({ manualAvailable: true, graphError: true }).extend({ forms: z.array(metaFormSummarySchema) });

export async function getMetaForms(context: Context, after?: string) {
  let next: string | null = null, graphError: string | null = null;
  try {
    const page = await fetchMetaFormsPage(context.pageId, after);
    const registered = await context.admin.rpc("register_meta_lead_forms", {
      p_page_id: context.pageId, p_studio_id: context.studioId,
      p_forms: page.data.map(item => ({ ...item, created_time: item.created_time && Number.isFinite(Date.parse(item.created_time)) ? new Date(item.created_time).toISOString() : undefined })),
    });
    if (registered.error)
      throw new MetaManagementError("database_unavailable");
    next = page.next;
  }
  catch (error) {
    if (error instanceof MetaManagementError)
      throw error;
    graphError = error instanceof MetaLeadError ? error.code : "not_configured";
  }
  const result = await context.admin.rpc("get_meta_lead_management_summary", { p_page_id: context.pageId, p_studio_id: context.studioId });
  const summary = summarySchema.safeParse(result.data);
  if (result.error || !summary.success)
    throw new MetaManagementError("database_unavailable");
  let configured = true;
  try {
    getMetaGraphConfig();
  }
  catch {
    configured = false;
  }
  const { forms, ...counts } = summary.data;
  return { kind: "forms" as const, forms, next, diagnostics: { ...counts, manualAvailable: configured && !graphError, graphError } };
}

export async function getMetaAvailability(context: Context, formId: string, after?: string) {
  await form(context, formId);
  const page = await fetchMetaAvailabilityPage(formId, after);
  const dates = page.data.flatMap(item => item.created_time && Number.isFinite(Date.parse(item.created_time)) ? [new Date(item.created_time).toISOString()] : []);
  return { kind: "availability" as const, count: page.data.length, latest: dates.sort().at(-1) ?? null, next: page.next };
}

export async function getMetaJobStates(context: Context, formId: string, ids: string[]) {
  await form(context, formId);
  if (!ids.length)
    return [];
  const result = await context.admin.from("meta_lead_jobs").select("leadgen_id,form_id,status,crm_lead_id,last_error,updated_at")
    .eq("page_id", context.pageId).eq("studio_id", context.studioId).eq("form_id", formId).in("leadgen_id", ids);
  if (result.error)
    throw new MetaManagementError("database_unavailable");
  return metaJobStateSchema.array().parse(result.data);
}

export function previewMetaLead(lead: MetaLead, job: MetaJobState | undefined, enabled: boolean): MetaPreview {
  const answer = (name: string) => lead.field_data.find(field => field.name === name)?.values[0]?.trim() || null;
  let submittedAt: string | null = null, reason: string | null = null;
  try {
    submittedAt = metaSubmittedAt(lead);
    mapMetaLead(lead);
  }
  catch (error) {
    reason = error instanceof MetaLeadError ? error.code : "invalid_crm_fields";
  }
  let status: MetaPreview["status"] = reason ? "incomplete" : "not_imported";
  if (job?.status === "completed") {
    status = job.crm_lead_id ? "crm" : "skipped";
    reason = job.crm_lead_id ? null : "crm_lead_deleted";
  }
  else if (job?.status === "skipped") {
    status = "skipped";
    reason = "admin_skipped";
  }
  else if (job?.status === "pending" || job?.status === "processing") {
    status = job.status;
    reason = null;
  }
  else if (!reason && job?.status === "failed") {
    status = "error";
    reason = job.last_error;
  }
  const eligible = enabled && ["not_imported", "error"].includes(status);
  return { id: lead.id, submitted_at: submittedAt, client_name: answer("full_name") || [answer("first_name"), answer("last_name")].filter(Boolean).join(" ") || null,
    phone: answer("phone_number"), email: answer("email"), field_data: lead.field_data, status, reason: reason || (!enabled ? "form_disabled" : null), eligible };
}

export async function getMetaPreview(context: Context, formId: string, after?: string) {
  const policy = await form(context, formId);
  const page = await fetchMetaPreviewPage(formId, after);
  if (page.data.some(lead => lead.form_id && lead.form_id !== formId))
    throw new MetaManagementError("form_mismatch");
  const states = await getMetaJobStates(context, formId, page.data.map(lead => lead.id));
  const byId = new Map(states.map(state => [state.leadgen_id, state]));
  return { kind: "preview" as const, leads: page.data.map(lead => previewMetaLead(lead, byId.get(lead.id), policy.sync_enabled)), next: page.next };
}

export async function setMetaFormSync(context: Context, formId: string, enabled: boolean) {
  await form(context, formId);
  const result = await context.user.from("meta_lead_forms").update({ sync_enabled: enabled })
    .eq("page_id", context.pageId).eq("studio_id", context.studioId).eq("form_id", formId).select("form_id").maybeSingle();
  if (result.error || !result.data)
    throw new MetaManagementError("policy_save_failed");
}

export async function setMetaLeadExclusion(context: Context, formId: string, leadId: string, excluded: boolean) {
  await form(context, formId);
  if (excluded) {
    const lead = await fetchMetaLead(leadId);
    if (lead.form_id !== formId)
      throw new MetaManagementError("form_mismatch", 400);
  }
  const result = await context.user.rpc("set_meta_lead_exclusion", { p_page_id: context.pageId, p_studio_id: context.studioId, p_form_id: formId, p_leadgen_id: leadId, p_excluded: excluded });
  if (result.error)
    throw new MetaManagementError("exclusion_save_failed");
}

export async function planMetaImport(context: Context, formId: string, ids: string[]) {
  await form(context, formId, true);
  const states = new Map((await getMetaJobStates(context, formId, ids)).map(state => [state.leadgen_id, state]));
  const importable: string[] = [];
  const result = { kind: "plan" as const, importable, existing: 0, skipped: 0 };
  for (const id of new Set(ids)) {
    const state = states.get(id);
    if (state?.status === "completed" && state.crm_lead_id)
      result.existing++;
    else if (state?.status === "skipped" || state?.status === "completed")
      result.skipped++;
    else
      result.importable.push(id);
  }
  return result;
}

export async function enqueueMetaImport(context: Context, formId: string, ids: string[]) {
  const plan = await planMetaImport(context, formId, ids);
  if (plan.importable.length)
    await enqueueMetaLeads(plan.importable.map(leadgen_id => ({ leadgen_id, form_id: formId })), true, true);
  return plan;
}
