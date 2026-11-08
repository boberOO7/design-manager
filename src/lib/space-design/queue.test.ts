import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { processSpaceDesignQueue } from "./queue";
const identity = { studio_id: "studio", submission_id: "submission", lease_token: "lease" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_space_design_leads" ? [identity] : "created", error: null }));
});
it.each(["created", "duplicate", "stale"])("reports atomic completion %s", async outcome => {
  mocks.rpc.mockResolvedValueOnce({ data: [identity], error: null }).mockResolvedValueOnce({ data: outcome, error: null });
  expect(await processSpaceDesignQueue()).toMatchObject({ claimed: 1, [outcome]: 1 });
  expect(mocks.rpc).toHaveBeenCalledWith("complete_space_design_lead", { p_studio_id: "studio", p_submission_id: "submission", p_lease_token: "lease" });
});
it.each(["retried", "failed", "stale"])("persists sanitized failure or ignores stale worker: %s", async outcome => {
  mocks.rpc.mockResolvedValueOnce({ data: [identity], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "private database message" } })
    .mockResolvedValueOnce({ data: outcome, error: null });
  expect(await processSpaceDesignQueue()).toMatchObject({ [outcome]: 1 });
  expect(mocks.rpc).toHaveBeenLastCalledWith("fail_space_design_lead", { p_studio_id: "studio", p_submission_id: "submission", p_lease_token: "lease" });
});
it("handles a rejected API call and leaves recovery to lease expiration if retry persistence is unavailable", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [identity], error: null }).mockRejectedValueOnce(new Error("network down"))
    .mockResolvedValueOnce({ data: null, error: { message: "network down" } });
  await expect(processSpaceDesignQueue()).rejects.toThrow("space_design_retry_unavailable");
});
it("fails safely when the claim API is unavailable", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database down" } });
  await expect(processSpaceDesignQueue()).rejects.toThrow("space_design_claim_failed");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
