import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.membership }));
vi.mock("./tasks", () => ({ getMyTaskStageNames: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { getWorkLogReminders } from "./work-log";

describe("work log reminder calendar query", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    { label: "without a company break", daysOff: [], missingDates: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"] },
    { label: "with a break starting before the window", daysOff: [{ date: "2026-11-01", end_date: "2026-11-04" }], missingDates: ["2026-11-05", "2026-11-06", "2026-11-07"] },
  ])("loads the verified member's makeup schedule $label", async ({ daysOff, missingDates }) => {
    mocks.membership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: {
      authenticatedUserId: "employee", studio_id: "studio", joined_at: "2026-11-02T08:00:00Z",
    } });
    const makeup = { id: "makeup", event_type: "work_makeup", organizer_id: "employee", all_day: false,
      starts_at: "2026-11-07T08:00:00Z", ends_at: "2026-11-07T10:00:00Z", project_id: null, assignee_id: null,
      cancelled_at: null, recurrence_rule: null, series_id: null, occurrence_start: null, compensates_time_off_request_id: null,
      invites: [], participants: [] };
    const calendars = vi.fn();
    mocks.client.mockResolvedValue({ from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      eq: vi.fn(function (this: unknown, field: string, value: unknown) { calendars(table, field, value); return this; }),
      range: vi.fn().mockResolvedValue({ data: table === "calendar_events" ? [makeup] : table === "studio_days_off" ? daysOff : [], error: null }),
    })) });
    await expect(getWorkLogReminders(new Date("2026-11-08T12:00:00Z"))).resolves.toMatchObject({
      scope: "studio:employee", latestEligibleDate: "2026-11-07",
      missingDates,
    });
    expect(calendars).toHaveBeenCalledWith("calendar_events", "studio_id", "studio");
    expect(calendars).toHaveBeenCalledWith("time_off_requests", "user_id", "employee");
    expect(calendars).toHaveBeenCalledWith("time_off_requests", "all_day", true);
  });

  it("does not load any calendar without active verified membership", async () => {
    mocks.membership.mockResolvedValue({ status: "UNAUTHENTICATED" });
    await expect(getWorkLogReminders()).resolves.toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
