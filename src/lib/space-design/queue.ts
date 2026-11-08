import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import type { SpaceDesignPayload } from "./contracts";

export async function acceptSpaceDesignLead(keyId: string, studioId: string, payloadHash: string, payload: SpaceDesignPayload) {
  const { data, error } = await createAdminClient().rpc("accept_space_design_lead", {
    p_key_id: keyId, p_studio_id: studioId, p_submission_id: payload.submission_id, p_payload_hash: payloadHash, p_payload: payload,
  });
  if (error || !data) throw new Error("space_design_inbox_unavailable");
  return data;
}

export async function processSpaceDesignQueue() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_space_design_leads", { p_limit: 5 });
  if (error) throw new Error("space_design_claim_failed");
  const outcomes = await Promise.all((data ?? []).map(async job => {
    const identity = { p_studio_id: job.studio_id, p_submission_id: job.submission_id, p_lease_token: job.lease_token };
    try {
      const completed = await admin.rpc("complete_space_design_lead", identity);
      if (completed.error || !completed.data) throw new Error("space_design_completion_failed");
      return completed.data;
    } catch {
      // Never persist database messages or payloads in diagnostics. If this RPC
      // also fails, the durable lease expires and a later worker recovers it.
      const failure = await admin.rpc("fail_space_design_lead", identity);
      if (failure.error || !failure.data) throw new Error("space_design_retry_unavailable");
      return failure.data;
    }
  }));
  return {
    claimed: outcomes.length,
    created: outcomes.filter(value => value === "created").length,
    duplicate: outcomes.filter(value => value === "duplicate").length,
    retried: outcomes.filter(value => value === "retried").length,
    failed: outcomes.filter(value => value === "failed").length,
    stale: outcomes.filter(value => value === "stale").length,
  };
}
