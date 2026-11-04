import { describe, expect, it } from "vitest";
import { getWorkMakeupDates, summarizeDailyCalendarWork } from "./calendar-work-time";
import { getDailyCalendarContext } from "./work-log";
import { buildTeamActivity, type TeamActivityEvent } from "./team-activity";
import { materializeStatisticsEvents } from "./statistics-calendar";

const event = (id: string, changes: Partial<TeamActivityEvent> = {}): TeamActivityEvent => ({
  id, title: id, event_type: "business_trip", starts_at: "2026-10-22T21:00:00Z", ends_at: "2026-10-27T22:00:00Z",
  all_day: true, organizer_id: "admin", assignee_id: null, project_id: null, project: null,
  cancelled_at: null, recurrence_rule: null, series_id: null, occurrence_start: null, compensates_time_off_request_id: null,
  invites: [], participants: [{ event_id: id, user_id: "employee" }], ...changes,
});
const eligibility = { joinedDate: null, studioDaysOff: ["2026-10-27"] };
const now = "2026-10-28T12:00:00Z";

describe("shared Calendar work time", () => {
  it.each(["meeting", "presentation", "general", "internal_review"] as const)("credits %s only after RSVP, including acceptance after the event", eventType => {
    const row = event("rsvp", { event_type: eventType, all_day: false, organizer_id: "employee", participants: [],
      starts_at: "2026-10-23T09:00:00Z", ends_at: "2026-10-23T10:00:00Z" });
    for (const status of ["pending", "declined", "accepted"] as const) {
      const invites = [{ event_id: row.id, user_id: "employee", status }];
      const expected = status === "accepted" ? 60 : 0;
      expect(getDailyCalendarContext([row], invites, [], "employee", "2026-10-23", now).minutes).toBe(expected);
      const report = buildTeamActivity({ month: "2026-10", today: "2026-10-28", now, workdayMinutes: 480,
        people: [{ id: "employee", name: "Employee", active: true }], entries: [], submissions: [], timers: [],
        events: [{ ...row, invites }] });
      expect(report.people[0].days[22].minutes).toBe(expected);
    }
    expect(getDailyCalendarContext([row], [], [], "employee", "2026-10-23", now).minutes).toBe(0);
  });

  it("counts 8h on completed working days of an ongoing trip, using exclusive Kyiv dates across DST", () => {
    const trip = event("trip");
    const dates = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
    const daily = dates.map(date => getDailyCalendarContext([trip], [], trip.participants, "employee", date, now, eligibility).minutes);
    expect(daily).toEqual([0, 480, 0, 0, 480, 0, 0]);
    // October 23 has finished, even though the multi-day trip is still ongoing.
    expect(getDailyCalendarContext([trip], [], trip.participants, "employee", "2026-10-23", "2026-10-24T08:00:00Z").minutes).toBe(480);
    expect(getDailyCalendarContext([trip], [], trip.participants, "employee", "2026-10-23", "2026-10-23T12:00:00Z").minutes).toBe(0);
    expect(getDailyCalendarContext([trip], [], trip.participants, "admin", "2026-10-23", now).minutes).toBe(0);

    const report = buildTeamActivity({ month: "2026-10", today: "2026-10-28", now, workdayMinutes: 480,
      people: [{ id: "employee", name: "Employee", active: true }], entries: [], submissions: [], timers: [], events: [trip], studioDaysOff: eligibility.studioDaysOff });
    expect(dates.map(date => report.people[0].days.find(day => day.date === date)?.minutes)).toEqual(daily);
    expect(report.people[0].days[22].items).toMatchObject([{ activityKind: "calendar", minutes: 480, calendarEvent: { id: "trip" } }]);
  });

  it("does not multiply work time for duplicate or overlapping calendar commitments", () => {
    const first = event("first", { all_day: false, starts_at: "2026-10-23T09:00:00Z", ends_at: "2026-10-23T10:00:00Z" });
    const second = event("second", { all_day: false, starts_at: "2026-10-23T09:30:00Z", ends_at: "2026-10-23T10:30:00Z" });
    const context = (events: TeamActivityEvent[]) => getDailyCalendarContext(events, [], events.flatMap(row => row.participants), "employee", "2026-10-23", now);
    expect(context([first, first, second]).minutes).toBe(90);
    expect(context([first, event("trip"), event("another-trip")]).minutes).toBe(480);
    expect(context([event("cancelled", { cancelled_at: now })]).minutes).toBe(0);
  });

  it("honors full-day leave and joining dates without converting them to worked hours", () => {
    const occurrences = materializeStatisticsEvents([event("trip")], { from: "2026-10-23", through: "2026-10-23" });
    expect(summarizeDailyCalendarWork(occurrences, "2026-10-23", now, { joinedDate: "2026-10-26" }).minutes).toBe(0);
    expect(summarizeDailyCalendarWork(occurrences, "2026-10-23", now, { joinedDate: null,
      timeOff: [{ start_date: "2026-10-23", end_date: "2026-10-23" }] }).minutes).toBe(0);
  });

  it("resolves recurring makeup dates, moved/cancelled overrides and overnight day boundaries for the organizer", () => {
    const parent = event("root", { event_type: "work_makeup", organizer_id: "employee", all_day: false,
      starts_at: "2026-11-07T08:00:00Z", ends_at: "2026-11-07T10:00:00Z",
      recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 3 } });
    const events = [parent, parent,
      event("cancelled", { ...parent, id: "cancelled", series_id: "root", occurrence_start: "2026-11-08T08:00:00Z", cancelled_at: now }),
      event("moved", { ...parent, id: "moved", series_id: "root", occurrence_start: "2026-11-09T08:00:00Z",
        starts_at: "2026-11-10T21:30:00Z", ends_at: "2026-11-10T22:30:00Z" }),
      event("someone-else", { ...parent, id: "someone-else", organizer_id: "someone-else", recurrence_rule: null }),
    ];
    const range = { from: "2026-11-07", through: "2026-11-11" };
    expect(getWorkMakeupDates(events, "employee", range)).toEqual(["2026-11-07", "2026-11-10", "2026-11-11"]);
    const occurrences = materializeStatisticsEvents(events, range);
    expect(summarizeDailyCalendarWork(occurrences, "2026-11-07", "2026-11-12T12:00:00Z").minutes).toBe(0);
    expect(getWorkMakeupDates([event("all-day", { ...parent, id: "all-day", all_day: true, recurrence_rule: null,
      starts_at: "2026-11-06T22:00:00Z", ends_at: "2026-11-07T22:00:00Z" })], "employee", range)).toEqual(["2026-11-07"]);
  });
});
