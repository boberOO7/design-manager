import { describe, expect, it } from "vitest";
import { buildCalendarStatistics, materializeStatisticsEvents, type StatisticsCalendarEvent } from "./statistics-calendar";

const range = { from: "2026-09-01", through: "2026-09-30" };
const now = "2026-10-01T12:00:00Z";
const event = (changes: Partial<StatisticsCalendarEvent> = {}): StatisticsCalendarEvent => ({
  id: "event", event_type: "meeting", starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T10:00:00Z", all_day: false,
  project_id: null, organizer_id: "person", cancelled_at: null, recurrence_rule: null, series_id: null, occurrence_start: null,
  compensates_time_off_request_id: null, ...changes,
});
const daily = { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 3 };

describe("calendar statistics occurrences", () => {
  it("counts instances once, suppresses cancellations and uses moved overrides", () => {
    const rows = [event({ recurrence_rule: daily }),
      event({ id: "cancelled", series_id: "event", occurrence_start: "2026-09-02T09:00:00Z", starts_at: "2026-09-02T09:00:00Z", ends_at: "2026-09-02T10:00:00Z", cancelled_at: "2026-09-01T12:00:00Z" }),
      event({ id: "moved-out", series_id: "event", occurrence_start: "2026-09-03T09:00:00Z", starts_at: "2026-10-03T09:00:00Z", ends_at: "2026-10-03T10:00:00Z" })];
    const report = buildCalendarStatistics([...rows, rows[0]], [], range, now);
    expect(report.totals).toMatchObject({ count: 1, timedCount: 1, hours: 1, averageHours: 1 });
    expect(report.categories.find(row => row.eventType === "meeting")?.count).toBe(1);
    // No participants are supplied: attendance cannot multiply an event.
    expect(materializeStatisticsEvents(rows, range).map(row => row.starts_at)).toEqual(["2026-09-01T09:00:00.000Z"]);
  });

  it("includes overrides moved in from original occurrences outside the selected period", () => {
    const rows = [event({ starts_at: "2026-07-01T09:00:00Z", ends_at: "2026-07-01T10:00:00Z", recurrence_rule: { ...daily, occurrenceCount: 2 } }),
      event({ id: "moved-in", series_id: "event", occurrence_start: "2026-07-02T09:00:00Z", starts_at: "2026-09-10T09:00:00Z", ends_at: "2026-09-10T11:00:00Z" })];
    expect(buildCalendarStatistics(rows, [], range, now).totals).toMatchObject({ count: 1, hours: 2 });
    expect(materializeStatisticsEvents(rows.map(row => ({ ...row, cancelled_at: "2026-08-01T12:00:00Z" })), range)).toEqual([]);
  });

  it("retains recurring long spans starting more than two days before the period", () => {
    const rows = [event({ starts_at: "2026-08-25T09:00:00Z", ends_at: "2026-09-04T09:00:00Z", recurrence_rule: { ...daily, occurrenceCount: 1 }, event_type: "business_trip" })];
    expect(buildCalendarStatistics(rows, [], { from: "2026-09-01", through: "2026-09-02" }, now).totals).toMatchObject({ count: 1, hours: 48 });
  });

  it("keeps exclusive all-day spans as days, including recurring trips across DST", () => {
    const rows = [event({ starts_at: "2026-10-23T21:00:00Z", ends_at: "2026-10-26T22:00:00Z", event_type: "business_trip", all_day: true, recurrence_rule: { ...daily, occurrenceCount: 1 } })];
    const report = buildCalendarStatistics(rows, [], { from: "2026-10-01", through: "2026-10-31" }, "2026-11-01T12:00:00Z");
    expect(report.totals).toMatchObject({ count: 1, hours: 0, timedCount: 0, averageHours: null, allDayCount: 1, allDayDays: 3 });
    expect(materializeStatisticsEvents(rows, { from: "2026-10-01", through: "2026-10-31" })[0].ends_at).toBe("2026-10-26T22:00:00.000Z");
  });

  it("clips to Kyiv period and month boundaries and counts at clipped start", () => {
    const rows = [event({ starts_at: "2026-08-31T20:00:00Z", ends_at: "2026-09-01T01:00:00Z" }),
      event({ id: "two-months", starts_at: "2026-09-30T20:00:00Z", ends_at: "2026-10-01T02:00:00Z" })];
    const report = buildCalendarStatistics(rows, [], { from: "2026-09-01", through: "2026-10-01" }, "2026-10-02T12:00:00Z");
    expect(report.totals.hours).toBe(10);
    expect(report.months).toEqual([{ month: "2026-09-01", count: 2, hours: 5, timedCount: 2, allDayDays: 0 }, { month: "2026-10-01", count: 0, hours: 5, timedCount: 1, allDayDays: 0 }]);
  });

  it("keeps invalid durations unknown and does not assert missing-end events have elapsed", () => {
    const rows = [event({ id: "zero", ends_at: "2026-09-01T09:00:00Z" }), event({ id: "unknown", ends_at: "" })];
    const report = buildCalendarStatistics(rows, [], range, now);
    expect(report.totals).toMatchObject({ count: 1, timedCount: 0, unknownDurationCount: 1, averageHours: null });
    expect(report.unknownTimingCount).toBe(1);
    expect(buildCalendarStatistics([event({ project_id: "unknown-hours", ends_at: "2026-09-01T09:00:00Z" })], [], range, now).projectAverages.hours).toBeNull();
    const recurring = buildCalendarStatistics([event({ all_day: true, ends_at: "2026-09-01T09:00:00Z", recurrence_rule: daily })], [], range, now);
    expect(recurring.totals).toMatchObject({ count: 3, allDayDays: 0, unknownDurationCount: 3 });
  });

  it("separates future and ongoing events and exports make-up solely for attendance", () => {
    const rows = [event(), event({ id: "ongoing", ends_at: "2026-09-01T13:00:00Z" }),
      event({ id: "future", starts_at: "2026-09-02T09:00:00Z", ends_at: "2026-09-02T10:00:00Z" }),
      event({ id: "makeup", event_type: "work_makeup" })];
    const report = buildCalendarStatistics(rows, [], range, "2026-09-01T12:00:00Z");
    expect(report.totals.count).toBe(1);
    expect(report.ongoingCount).toBe(1);
    expect(report.plannedCount).toBe(1);
    expect(materializeStatisticsEvents(rows, range).find(row => row.event_type === "work_makeup")?.organizer_id).toBe("person");
  });

  it("uses distinct linked projects with elapsed records as the denominator", () => {
    const rows = [event({ project_id: "a" }), event({ id: "a2", project_id: "a" }),
      event({ id: "b", project_id: "b", ends_at: "2026-09-01T11:00:00Z" }),
      event({ id: "unlinked" }), event({ id: "planned", project_id: "c", starts_at: "2026-10-01T09:00:00Z", ends_at: "2026-10-01T10:00:00Z" })];
    const report = buildCalendarStatistics(rows, [{ id: "a", name: "Alpha" }, { id: "unused", name: "Unused" }], range, now);
    expect(report.totals).toMatchObject({ count: 4, hours: 5 });
    expect(report.projectLinked).toMatchObject({ count: 3, hours: 4 });
    expect(report.unlinked).toMatchObject({ count: 1, hours: 1 });
    expect(report.projectAverages).toEqual({ projectCount: 2, count: 1.5, hours: 2 });
    expect(report.projects.find(row => row.id === "b")?.name).toBeNull();
  });
});
