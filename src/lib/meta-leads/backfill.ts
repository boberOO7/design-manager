import "server-only";

import { getMetaLeadTarget } from "./config";
import { listMetaIds } from "./graph";
import { enqueueMetaLeads } from "./queue";
import { createAdminClient } from "@/lib/supabase/admin-client";

export async function backfillMetaLeads(retryFailed = false) {
  const { pageId, studioId } = getMetaLeadTarget();
  const policy = await createAdminClient().from("meta_lead_forms").select("form_id").eq("page_id",pageId).eq("studio_id",studioId).eq("sync_enabled",true);
  if (policy.error) throw new Error("meta_form_policy_unavailable");
  const enabled = new Set(policy.data.map(form => form.form_id));
  let forms = 0, scanned = 0, enqueued = 0;
  for await (const formId of listMetaIds(pageId, "leadgen_forms")) {
    if (!enabled.has(formId)) continue;
    forms += 1;
    for await (const leadId of listMetaIds(formId, "leads")) {
      enqueued += await enqueueMetaLeads([{ leadgen_id: leadId, form_id: formId }], retryFailed, true);
      scanned += 1;
    }
  }
  return { forms, scanned, enqueued };
}
