import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), createClient: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getEmployeeProfileEmployment } from "./employee-profile-employment";

const studioId = "studio-1";
const employeeId = "employee-1";
const absenceId = "absence-1";
const request = {
  id: absenceId,
  request_type: "day_off",
  start_date: "2026-09-01",
  end_date: "2026-09-01",
  start_time: null,
  end_time: null,
  all_day: true,
};
const makeup = {
  id: "makeup-1",
  starts_at: "2026-10-10T09:00:00Z",
  ends_at: "2026-10-10T12:00:00Z",
  all_day: false,
  cancelled_at: null,
  compensates_time_off_request_id: absenceId,
};

function queryResult(data: unknown[], count = data.length, error: unknown = null) {
  const calls: unknown[][] = [];
  const query = Object.fromEntries(["select", "eq", "lte", "in", "order", "range"].map((method) => [method, vi.fn((...args: unknown[]) => {
    calls.push([method, ...args]);
    return method === "range" ? Promise.resolve({ data, count, error }) : query;
  })]));
  return { query, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: studioId });
});

describe("employee profile employment privacy and source contract", () => {
  it("rejects non-admins before creating a client or querying", async () => {
    mocks.admin.mockResolvedValue(null);
    await expect(getEmployeeProfileEmployment(employeeId, new Date("2026-10-03T12:00:00Z"))).rejects.toThrow("Studio administrator access required");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses canonical scoped requests, balance RPC, and compensation, preserving an unknown balance", async () => {
    const timeOff = queryResult([
      request,
      { ...request, id: "vacation-1", request_type: "vacation", start_date: "2026-09-20", end_date: "2026-09-22" },
    ]);
    const events = queryResult([
      makeup,
      { ...makeup, id: "cancelled-makeup", starts_at: "2026-10-10T09:00:00Z", ends_at: "2026-10-10T17:00:00Z", cancelled_at: "2026-10-01T00:00:00Z" },
      { ...makeup }, // duplicate ids are deduplicated by the canonical Calendar compensation helper
      { ...makeup, id: "other-day-makeup", compensates_time_off_request_id: "another-absence" },
    ]);
    mocks.from.mockImplementation((table: string) => table === "time_off_requests" ? timeOff.query : events.query);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });

    const result = await getEmployeeProfileEmployment(employeeId, new Date("2026-10-03T12:00:00Z"));

    expect(result).toEqual({
      asOf: "2026-10-03",
      absenceRequests: 2,
      makeupMinutes: 180,
      availableVacationDays: null,
      vacationPeriods: [{ id: "vacation-1", startDate: "2026-09-20", endDate: "2026-09-22" }],
    });
    expect(timeOff.calls).toContainEqual(["eq", "studio_id", studioId]);
    expect(timeOff.calls).toContainEqual(["eq", "user_id", employeeId]);
    expect(timeOff.calls).toContainEqual(["eq", "status", "approved"]);
    expect(timeOff.calls).toContainEqual(["lte", "start_date", "2026-10-03"]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_vacation_balance", { p_studio_id: studioId, p_user_id: employeeId, p_as_of: "2026-10-03" });
    expect(events.calls).toContainEqual(["eq", "studio_id", studioId]);
    expect(events.calls).toContainEqual(["eq", "event_type", "work_makeup"]);
    expect(events.calls).toContainEqual(["in", "compensates_time_off_request_id", [absenceId]]);
  });

  it("surfaces time-off, makeup, and balance query failures", async () => {
    const requestFailure = queryResult([], 0, { code: "offline" });
    mocks.from.mockReturnValue(requestFailure.query);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
    await expect(getEmployeeProfileEmployment(employeeId)).rejects.toThrow("Unable to load employee employment summary");

    const timeOff = queryResult([request]);
    const eventFailure = queryResult([], 0, { code: "offline" });
    mocks.from.mockImplementation((table: string) => table === "time_off_requests" ? timeOff.query : eventFailure.query);
    await expect(getEmployeeProfileEmployment(employeeId)).rejects.toThrow("Unable to load employee work makeup");

    mocks.from.mockReturnValue(timeOff.query);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "offline" } });
    await expect(getEmployeeProfileEmployment(employeeId)).rejects.toThrow("Unable to load employee employment summary");
  });
});
