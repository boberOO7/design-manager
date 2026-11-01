import "server-only";

import { getMetaLeadTarget } from "./config";
import { listMetaIds } from "./graph";
import { enqueueMetaLeads } from "./queue";

export async function backfillMetaLeads(retryFailed = false) {
  const { pageId } = getMetaLeadTarget();
  let forms = 0, scanned = 0, enqueued = 0;
  for await (const formId of listMetaIds(pageId, "leadgen_forms")) {
    forms += 1;
    for await (const leadId of listMetaIds(formId, "leads")) {
      enqueued += await enqueueMetaLeads([{ leadgen_id: leadId, form_id: formId }], retryFailed);
      scanned += 1;
    }
  }
  return { forms, scanned, enqueued };
}
