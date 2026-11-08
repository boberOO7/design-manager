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
