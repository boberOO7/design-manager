import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { getTeamActivity } from "./team-activity";

describe("team activity month query", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires verified admin membership before creating a data client", async () => {
    mocks.admin.mockResolvedValue(null);
    await expect(getTeamActivity("2026-10")).resolves.toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it.each(["2026-13", "2026-1", "not-a-month"])("rejects invalid month %s", async month => {
    await expect(getTeamActivity(month)).rejects.toThrow();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it.each([
    { month: "2026-10", next: "2026-11-01", capacity: 420, setting: 480, expected: 420 },
    { month: "2026-12", next: "2027-01-01", capacity: null, setting: 360, expected: 360 },
    { month: "2024-02", next: "2024-03-01", capacity: null, setting: null, expected: 480 },
  ])("bounds log and submission reads to $month and reuses the configured workday", async ({ month, next, capacity, setting, expected }) => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    const calls: Array<{ table: string; field: string; value: unknown; op: string }> = [];
    const from = vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      eq: vi.fn(function (this: unknown, field: string, value: unknown) { calls.push({ table, field, value, op: "eq" }); return this; }),
      gte: vi.fn(function (this: unknown, field: string, value: unknown) { calls.push({ table, field, value, op: "gte" }); return this; }),
      lt: vi.fn(function (this: unknown, field: string, value: unknown) { calls.push({ table, field, value, op: "lt" }); return this; }),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn(function (this: unknown, field: string, value: unknown) { calls.push({ table, field, value, op: "is" }); return this; }),
      single: vi.fn().mockResolvedValue({ data: { standard_workday_minutes: setting }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: capacity === null ? null : { daily_minutes: capacity }, error: null }),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    mocks.client.mockResolvedValue({ from });
    await expect(getTeamActivity(month, "2026-10-16")).resolves.toMatchObject({ month, workdayMinutes: expected, people: [] });
    for (const table of ["work_log_entries", "work_log_days"]) {
      expect(calls).toContainEqual({ table, field: "studio_id", value: "studio", op: "eq" });
      expect(calls).toContainEqual({ table, field: "work_date", value: `${month}-01`, op: "gte" });
      expect(calls).toContainEqual({ table, field: "work_date", value: next, op: "lt" });
    }
    expect(calls).toContainEqual({ table: "time_off_requests", field: "studio_id", value: "studio", op: "eq" });
    expect(calls).toContainEqual({ table: "time_off_requests", field: "status", value: "approved", op: "eq" });
    expect(calls).toContainEqual({ table: "time_off_requests", field: "cancelled_at", value: null, op: "is" });
    expect(calls).toContainEqual({ table: "time_off_requests", field: "start_date", value: next, op: "lt" });
    expect(calls).toContainEqual({ table: "time_off_requests", field: "end_date", value: `${month}-01`, op: "gte" });
    expect(calls).toContainEqual({ table: "studio_days_off", field: "date", value: `${month}-01`, op: "gte" });
    expect(calls).toContainEqual({ table: "studio_days_off", field: "date", value: next, op: "lt" });
    expect(calls).toContainEqual({ table: "review_timer_sessions", field: "studio_id", value: "studio", op: "eq" });
    expect(calls.some(call => call.table === "review_timer_sessions" && call.field === "state")).toBe(false);
  });

  it("reports a failed source instead of returning plausible empty activity", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.client.mockResolvedValue({ from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      range: vi.fn().mockResolvedValue({ data: null, error: new Error("Read failed") }),
    })) });
    await expect(getTeamActivity("2026-09", "2026-10-16")).rejects.toThrow("Unable to load team activity");
  });
});
