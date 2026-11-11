import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), client: vi.fn(), rpc: vi.fn(), schedule: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.schedule }));
import { PUT } from "./route";
afterEach(() => vi.clearAllMocks());
const payload = { date: "2026-05-20", entries: [{ activity_kind: "internal", internal_activity_type: "team_walkthrough",
  task_id: null, review_round_id: null, minutes: 45 }] };
const request = (internalType: string) => new Request("http://localhost/api/work-log", { method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, entries: payload.entries.map(entry => ({ ...entry, internal_activity_type: internalType })) }) });
it.each(["team_walkthrough", "studio_work"])("rejects %s for an employee before creating the database client", async internalType => {
  mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "employee" } });
  expect((await PUT(request(internalType))).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["team_walkthrough", "studio_work"])("passes an admin's %s through the existing atomic daily save", async internalType => {
  mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "admin", studio_id: "studio", authenticatedUserId: "admin" } });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
  expect((await PUT(request(internalType))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("save_daily_work_log", { p_work_date: payload.date,
    p_entries: payload.entries.map(entry => ({ ...entry, internal_activity_type: internalType })), p_timer_snapshot: undefined });
});
