import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sync: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/equipment-catalog/sync", () => ({ syncIcecatDaily: mocks.sync }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("requires exact Bearer authorization and explicit activation", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  for (const authorization of ["", "test-secret", "Bearer incorrect", "Bearer test-secret-extra"]) {
    expect((await GET(new Request("http://localhost", { headers: { authorization } }))).status).toBe(401);
  }
  vi.stubEnv("ICECAT_SYNC_ENABLED", "false");
  expect(await (await GET(new Request("http://localhost", { headers: { authorization: "Bearer test-secret" } }))).json()).toEqual({ status: "disabled" });
  expect(mocks.sync).not.toHaveBeenCalled();
  vi.stubEnv("ICECAT_SYNC_ENABLED", "true");
  mocks.sync.mockResolvedValue({ status: "completed" });
  expect((await GET(new Request("http://localhost", { headers: { authorization: "Bearer test-secret" } }))).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledOnce();
});
