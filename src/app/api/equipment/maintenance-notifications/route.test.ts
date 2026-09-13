import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("protects the daily worker and returns the idempotent RPC result", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  for (const authorization of ["", "test-secret", "Bearer incorrect", "Bearer test-secret-extra"]) {
    expect((await GET(new Request("http://localhost", { headers: { authorization } }))).status).toBe(401);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();

  mocks.rpc.mockResolvedValue({ data: 3, error: null });
  const response = await GET(new Request("http://localhost", { headers: { authorization: "Bearer test-secret" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, notificationsCreated: 3 });
  expect(mocks.rpc).toHaveBeenCalledWith("generate_equipment_maintenance_notifications");
});
