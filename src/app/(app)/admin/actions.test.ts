import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), schedule: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.schedule }));
import { saveStandardWorkday } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
});

it("refreshes payroll attribution after the guarded capacity save succeeds", async () => {
  expect(await saveStandardWorkday(360)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("set_standard_workday_minutes", { p_studio_id: "verified", p_minutes: 360 });
  expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith("verified");
});

it("requires valid minutes and verified administration before creating a client", async () => {
  for (const minutes of [0, -60, 0.5, NaN, Infinity, 2147483648]) expect(await saveStandardWorkday(minutes)).toBe(false);
  mocks.admin.mockResolvedValue(null);
  expect(await saveStandardWorkday(360)).toBe(false);
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.schedule).not.toHaveBeenCalled();
});

it("does not schedule attribution after a failed capacity save", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "denied" } });
  expect(await saveStandardWorkday(360)).toBe(false);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
