import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import type { Database } from "@/types/database.types";
import { getMetaGraphConfig, getMetaLeadTarget } from "./config";
import { fetchMetaLead, MetaLeadError } from "./graph";
import { mapMetaLead, metaSubmittedAt } from "./mapping";

export type MetaLeadEvent = { leadgen_id: string; form_id?: string; ad_id?: string; submitted_at?: string };
type Job = Database["public"]["Tables"]["meta_lead_jobs"]["Row"];

export async function enqueueMetaLeads(events: MetaLeadEvent[], retryFailed = false, manual = false, notifyAdmins = true) {
  const target = getMetaLeadTarget();
  if (!events.length) return 0;
  const { data, error } = await createAdminClient().rpc("enqueue_meta_lead_jobs", {
    p_page_id: target.pageId, p_studio_id: target.studioId,
    p_events: events.map(event => ({ ...event, notify_admins: notifyAdmins })), p_retry_failed: retryFailed, p_manual: manual,
  });
  if (error) throw new MetaLeadError("meta_enqueue_failed");
  return data;
}

async function processJob(job: Job) {
  const admin = createAdminClient();
  if (!job.lease_token) throw new MetaLeadError("missing_job_lease");
  const identity = { p_page_id: job.page_id, p_leadgen_id: job.leadgen_id, p_studio_id: job.studio_id, p_lease_token: job.lease_token };
  try {
    const payload = await fetchMetaLead(job.leadgen_id);
    if (job.form_id && payload.form_id !== job.form_id) throw new MetaLeadError("meta_form_mismatch", false);
    // Persist the complete fetched answers even if required CRM fields fail
    // validation. Operators can correct the mapping and retry the failed inbox.
    let submittedAt: string | null = null;
    try { submittedAt = metaSubmittedAt(payload); } catch { /* Keep invalid source time in the original payload. */ }
    const saved = await admin.from("meta_lead_jobs").update({
      payload, form_id: payload.form_id ?? job.form_id, ad_id: payload.ad_id ?? job.ad_id,
      submitted_at: submittedAt,
    }).eq("page_id", job.page_id).eq("leadgen_id", job.leadgen_id).eq("studio_id", job.studio_id)
      .eq("status", "processing").eq("lease_token", job.lease_token).select("leadgen_id").maybeSingle();
    if (saved.error) throw new MetaLeadError("meta_payload_save_failed");
    if (!saved.data) return "stale";
    metaSubmittedAt(payload);
    const result = await admin.rpc("complete_meta_lead_job", { ...identity, p_lead: mapMetaLead(payload) });
    if (result.error) throw new MetaLeadError("meta_crm_write_failed");
    if (result.data) return "completed";
    const state=await admin.from("meta_lead_jobs").select("status,last_error").eq("page_id",job.page_id)
      .eq("studio_id",job.studio_id).eq("leadgen_id",job.leadgen_id).maybeSingle();
    if (state.error) throw new MetaLeadError("meta_result_read_failed");
    return state.data?.status==="skipped" && state.data.last_error==="duplicate_phone" ? "skipped" : "stale";
  } catch (error) {
    const failure = error instanceof MetaLeadError ? error : new MetaLeadError("meta_processing_failed");
    const result = await admin.rpc("fail_meta_lead_job", { ...identity, p_error: failure.code, p_retry: failure.retryable });
    if (result.error) throw new MetaLeadError("meta_retry_write_failed");
    return failure.retryable && job.attempts < 8 ? "retried" : "failed";
  }
}

export async function processMetaLeadQueue(leadgenIds?: string[]) {
  const { pageId, studioId } = getMetaLeadTarget();
  getMetaGraphConfig();
  const { data, error } = await createAdminClient().rpc("claim_meta_lead_jobs", { p_page_id: pageId, p_studio_id: studioId, p_limit: 5, ...(leadgenIds ? { p_leadgen_ids: leadgenIds } : {}) });
  if (error) throw new MetaLeadError("meta_claim_failed");
  const outcomes = await Promise.all((data ?? []).map(processJob));
  return {
    claimed: outcomes.length,
    completed: outcomes.filter(value => value === "completed").length,
    retried: outcomes.filter(value => value === "retried").length,
    failed: outcomes.filter(value => value === "failed").length,
    skipped: outcomes.filter(value => value === "skipped").length,
    stale: outcomes.filter(value => value === "stale").length,
  };
}
