import { describe, expect, it } from "vitest";
import { buildAttendanceStatistics, type AttendanceMakeupEvent, type AttendanceRequest } from "./statistics-attendance";

const range = { from: "2026-10-01", through: "2026-10-31" };
const now = "2026-10-04T09:00:00Z"; // Noon in Kyiv.
const members = [
  { id: "active", name: "Active employee", active: true },
  { id: "former", name: "Former employee", active: false },
];
function leave(overrides: Partial<AttendanceRequest> = {}): AttendanceRequest {
  return {
    id: "leave", user_id: "active", request_type: "vacation", status: "approved",
    start_date: "2026-10-01", end_date: "2026-10-01", start_time: null, end_time: null, all_day: true,
    ...overrides,
  };
}
function makeup(overrides: Partial<AttendanceMakeupEvent> = {}): AttendanceMakeupEvent {
  return {
    id: "makeup", organizer_id: "active", event_type: "work_makeup", all_day: false,
    starts_at: "2026-10-02T15:00:00Z", ends_at: "2026-10-02T17:00:00Z",
    cancelled_at: null, recurrence_rule: null, series_id: null, occurrence_start: null,
    compensates_time_off_request_id: null, project_id: null, ...overrides,
  };
}

describe("attendance statistics", () => {
  it("clips leave crossing the period and today, counting inclusive calendar days", () => {
    const result = buildAttendanceStatistics([
      leave({ start_date: "2026-09-29", end_date: "2026-10-06" }),
    ], [], members, range, now);
    expect(result.totals.elapsedLeave.vacation).toEqual({ days: 4, hours: 0 });
    expect(result.totals.futureLeave.vacation).toEqual({ days: 2, hours: 0 });
  });

  it("unions overlapping and duplicate full-day requests separately per category and employee", () => {
    const request = leave({ end_date: "2026-10-03" });
    const result = buildAttendanceStatistics([
      request, request,
      leave({ id: "overlap", start_date: "2026-10-02", end_date: "2026-10-04" }),
      leave({ id: "sick", request_type: "sick_leave", start_date: "2026-10-02", end_date: "2026-10-02" }),
      leave({ id: "former-leave", user_id: "former" }),
    ], [], members, range, now);
    expect(result.employees.find(employee => employee.id === "active")?.elapsedLeave.vacation.days).toBe(4);
    expect(result.totals.elapsedLeave.vacation.days).toBe(5);
    expect(result.totals.elapsedLeave.sick_leave.days).toBe(1);
  });

  it("unions partial hours, clips today's elapsed time, and keeps hours separate from days", () => {
    const result = buildAttendanceStatistics([
      leave({ id: "partial", request_type: "day_off", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "09:00:00", end_time: "13:00:00" }),
      leave({ id: "overlap", request_type: "day_off", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "11:00", end_time: "14:00" }),
      leave({ id: "appointment", request_type: "medical_appointment", start_date: "2026-10-02", end_date: "2026-10-02", all_day: false, start_time: "09:00", end_time: "10:30" }),
    ], [], members, range, now);
    expect(result.totals.elapsedLeave.day_off).toEqual({ days: 0, hours: 3 });
    expect(result.totals.elapsedLeave.medical_appointment).toEqual({ days: 0, hours: 1.5 });
    expect(result.totals.futureLeave.day_off).toEqual({ days: 0, hours: 2 });
  });

  it("includes today's upcoming and ongoing partial commitments outside the selected usage period", () => {
    const result = buildAttendanceStatistics([
      leave({ id: "ongoing", user_id: "former", request_type: "day_off", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "11:00", end_time: "13:00" }),
      leave({ id: "upcoming", user_id: "former", request_type: "day_off", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "14:00", end_time: "16:30" }),
      leave({ id: "overlap", user_id: "former", request_type: "day_off", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "15:00", end_time: "16:00" }),
      leave({ id: "ended", request_type: "medical_appointment", start_date: "2026-10-04", end_date: "2026-10-04", all_day: false, start_time: "09:00", end_time: "11:00" }),
    ], [], members, { from: "2026-09-01", through: "2026-09-30" }, now);
    expect(result.totals.elapsedLeave.day_off).toEqual({ days: 0, hours: 0 });
    expect(result.totals.futureLeave.day_off).toEqual({ days: 0, hours: 3.5 });
    expect(result.totals.futureLeave.medical_appointment.hours).toBe(0);
    expect(result.employees.find(employee => employee.id === "former")?.futureLeave.day_off.hours).toBe(3.5);
  });

  it("does not count a partial request again when its day is already covered in the same category", () => {
    const result = buildAttendanceStatistics([
      leave(),
      leave({ id: "partial", all_day: false, start_time: "10:00", end_time: "12:00" }),
    ], [], members, range, now);
    expect(result.totals.elapsedLeave.vacation).toEqual({ days: 1, hours: 0 });
  });

  it("shows approved future commitments outside the selected period and excludes other statuses", () => {
    const result = buildAttendanceStatistics([
      leave({ id: "future", start_date: "2027-01-01", end_date: "2027-01-03" }),
      leave({ id: "overlap", start_date: "2027-01-02", end_date: "2027-01-04" }),
      leave({ id: "future-hour", request_type: "other", start_date: "2026-11-01", end_date: "2026-11-01", all_day: false, start_time: "09:00", end_time: "11:30" }),
      leave({ id: "pending", status: "pending" }),
      leave({ id: "rejected", status: "rejected" }),
      leave({ id: "cancelled", status: "cancelled" }),
    ], [], members, { from: "2026-09-01", through: "2026-09-30" }, now);
    expect(result.totals.elapsedLeave.vacation.days).toBe(0);
    expect(result.totals.futureLeave.vacation.days).toBe(4);
    expect(result.totals.futureLeave.other).toEqual({ days: 0, hours: 2.5 });
  });

  it("retains historical inactive employees and zero active employees without ranking", () => {
    const result = buildAttendanceStatistics([leave({ user_id: "former", request_type: "sick_leave" })], [], members, range, now);
    expect(result.employees.map(employee => [employee.id, employee.active])).toEqual([["active", true], ["former", false]]);
    expect(result.employees[0].elapsedLeave.sick_leave.days).toBe(0);
    expect(result.employees[1].elapsedLeave.sick_leave.days).toBe(1);
    expect(buildAttendanceStatistics([], [], members, range, now).employees.map(employee => employee.id)).toEqual(["active"]);
  });

  it("clips timed makeup at period boundaries and separates ongoing/future scheduled hours", () => {
    const result = buildAttendanceStatistics([], [
      makeup(), makeup(),
      makeup({ id: "crossing", starts_at: "2026-09-30T20:00:00Z", ends_at: "2026-09-30T23:00:00Z" }),
      makeup({ id: "ongoing", starts_at: "2026-10-04T08:00:00Z", ends_at: "2026-10-04T10:00:00Z" }),
      makeup({ id: "future", starts_at: "2027-01-01T08:00:00Z", ends_at: "2027-01-01T11:00:00Z" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(5); // 2 + 2 since Kyiv midnight + 1 ongoing.
    expect(result.totals.plannedMakeupHours).toBe(4);
  });

  it("uses canonical eight hours for all-day makeup and keeps ongoing all-day events planned", () => {
    const result = buildAttendanceStatistics([], [
      makeup({ id: "all-day", all_day: true, starts_at: "2026-10-01T21:00:00Z", ends_at: "2026-10-02T21:00:00Z" }),
      makeup({ id: "ongoing-day", all_day: true, starts_at: "2026-10-03T21:00:00Z", ends_at: "2026-10-04T21:00:00Z" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(8);
    expect(result.totals.plannedMakeupHours).toBe(8);
  });

  it("ignores cancelled makeup, non-makeup rows, and orphan recurrence overrides", () => {
    const result = buildAttendanceStatistics([], [
      makeup({ cancelled_at: "2026-10-03T09:00:00Z" }),
      makeup({ id: "meeting", event_type: "meeting" }),
      makeup({ id: "exception", series_id: "series" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(0);
    expect(result.totals.plannedMakeupHours).toBe(0);
  });

  it("counts recurring elapsed makeup occurrences and excludes cancelled or moved originals", () => {
    const series = makeup({ id: "series", starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T17:00:00Z",
      recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 3 } });
    const result = buildAttendanceStatistics([], [series,
      makeup({ id: "cancelled", series_id: "series", occurrence_start: "2026-10-02T15:00:00Z", cancelled_at: now }),
      makeup({ id: "moved", series_id: "series", occurrence_start: "2026-10-03T15:00:00Z", starts_at: "2026-10-05T15:00:00Z", ends_at: "2026-10-05T17:00:00Z" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(2);
    expect(result.totals.plannedMakeupHours).toBe(2);
  });

  it("marks unbounded future recurrence unavailable while keeping elapsed hours and other employees' oneoffs", () => {
    const result = buildAttendanceStatistics([], [
      makeup({ id: "series", starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T17:00:00Z",
        recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null } }),
      makeup({ id: "future", organizer_id: "former", starts_at: "2026-11-01T15:00:00Z", ends_at: "2026-11-01T17:00:00Z" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(6);
    expect(result.totals.plannedMakeupHours).toBeNull();
    expect(result.employees.find(employee => employee.id === "active")?.plannedMakeupHours).toBeNull();
    expect(result.employees.find(employee => employee.id === "former")?.plannedMakeupHours).toBe(2);
  });

  it("preserves type-changed overrides before filtering makeup occurrences", () => {
    const series = makeup({ id: "series", starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T17:00:00Z",
      recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: "2026-10-04", occurrenceCount: null } });
    const result = buildAttendanceStatistics([], [series,
      makeup({ id: "changed-past", event_type: "meeting", series_id: "series", occurrence_start: "2026-10-02T15:00:00Z" }),
      makeup({ id: "changed-future", event_type: "meeting", series_id: "series", occurrence_start: "2026-10-05T15:00:00Z", starts_at: "2026-10-05T15:00:00Z", ends_at: "2026-10-05T17:00:00Z" }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(4);
    expect(result.totals.plannedMakeupHours).toBe(2);
    const changedIntoMakeup = buildAttendanceStatistics([], [
      { ...series, event_type: "meeting" },
      makeup({ id: "makeup-override", series_id: "series", occurrence_start: "2026-10-05T15:00:00Z", starts_at: "2026-10-05T15:00:00Z", ends_at: "2026-10-05T17:00:00Z" }),
    ], members, range, now);
    expect(changedIntoMakeup.totals.plannedMakeupHours).toBe(2);
  });

  it("does not expand live future recurrence even when it has a distant end date", () => {
    const result = buildAttendanceStatistics([], [
      makeup({ starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T17:00:00Z",
        recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: "9999-12-31", occurrenceCount: null } }),
    ], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(6);
    expect(result.totals.plannedMakeupHours).toBeNull();
  });

  it("keeps expired finite series numeric and accounts for the last ongoing count-limited occurrence", () => {
    const expired = makeup({ id: "expired", starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T17:00:00Z",
      recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: "2026-10-02", occurrenceCount: null } });
    const result = buildAttendanceStatistics([], [expired], members, range, now);
    expect(result.totals.elapsedMakeupHours).toBe(4);
    expect(result.totals.plannedMakeupHours).toBe(0);
    const ongoing = buildAttendanceStatistics([], [makeup({ starts_at: "2026-10-01T08:00:00Z", ends_at: "2026-10-01T10:00:00Z",
      recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 4 } })], members, range, now);
    expect(ongoing.totals.elapsedMakeupHours).toBe(7);
    expect(ongoing.totals.plannedMakeupHours).toBe(1);
  });

  it("excludes boundary-crossing all-day makeup hours without inventing daily allocation", () => {
    const result = buildAttendanceStatistics([], [
      makeup({ id: "cross-start", all_day: true, starts_at: "2026-09-29T21:00:00Z", ends_at: "2026-10-01T21:00:00Z" }),
      makeup({ id: "cross-end", all_day: true, starts_at: "2026-10-01T21:00:00Z", ends_at: "2026-10-03T21:00:00Z" }),
      makeup({ id: "contained", all_day: true, starts_at: "2026-09-30T21:00:00Z", ends_at: "2026-10-02T21:00:00Z" }),
    ], members, { from: "2026-10-01", through: "2026-10-02" }, now);
    expect(result.totals.elapsedMakeupHours).toBe(8);
    expect(result.totals.boundaryMakeupCount).toBe(2);
    expect(result.employees[0].boundaryMakeupCount).toBe(2);
  });

  it("returns counts and identity without copying sensitive fields", () => {
    const request = { ...leave(), private_note: "confidential diagnosis", review_note: "private review" };
    const event = { ...makeup(), description: "private description", title: "private title" };
    const result = buildAttendanceStatistics([request], [event], members, range, now);
    expect(JSON.stringify(result)).not.toMatch(/private_note|review_note|confidential diagnosis|private description|private title/);
  });

  it("uses Kyiv today at a UTC date boundary", () => {
    const result = buildAttendanceStatistics([
      leave({ start_date: "2026-10-05", end_date: "2026-10-05" }),
    ], [], members, range, "2026-10-04T22:00:00Z");
    expect(result.totals.elapsedLeave.vacation.days).toBe(1);
    expect(result.totals.futureLeave.vacation.days).toBe(0);
  });
});
