import { beforeEach, expect, it, vi } from "vitest";
import type { SpaceDesignPayload } from "./contracts";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { acceptSpaceDesignLead } from "./queue";

const payload: SpaceDesignPayload = {
  schema_version: 1, submission_id: "65000000-0000-4000-8000-000000000002", submitted_at: "2026-11-08T12:00:00Z",
  form_id: 3032, form_location: "footer", language: "uk", page_url: "https://example.test",
  client_name: "Fixture", phone: null, email: "fixture@example.test",
};
beforeEach(() => vi.resetAllMocks());
it("passes the verified key/studio binding and validated payload to atomic acceptance", async () => {
  mocks.rpc.mockResolvedValue({ data: "accepted", error: null });
  expect(await acceptSpaceDesignLead("key", "studio", "hash", payload)).toBe("accepted");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("accept_space_design_lead", {
    p_key_id: "key", p_studio_id: "studio", p_submission_id: payload.submission_id, p_payload_hash: "hash", p_payload: payload,
  });
});
it("does not expose API errors or acknowledge an unconfirmed inbox write", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database response" } });
  await expect(acceptSpaceDesignLead("key", "studio", "hash", payload)).rejects.toThrow("space_design_inbox_unavailable");
});
