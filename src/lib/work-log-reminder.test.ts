import { describe, expect, it } from "vitest";
import { buildWeeklyWorkLog, buildWorkLogReminders, getWorkLogReminderWindow, WORK_TRACKING_ROLLOUT_DATE } from "./work-log";
import { isWorkLogReminderRelevant, takeWorkLogReminder } from "./work-log-reminder";

const submitted = (date: string) => ({ work_date: date, submitted_at: `${date}T12:00:00Z` });
const eligibility = { joinedDate: "2026-11-02" };
const reminders = (today: string, saved: string[] = []) => ({ scope: "studio:user", ...buildWorkLogReminders(today, saved.map(submitted), eligibility) });
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("weekly Work Log and missing-day reminders", () => {
  it("caps a long-tenure employee's reminders at rollout and never includes today", () => {
    const rules = { joinedDate: "2024-01-01" };
    expect(getWorkLogReminderWindow("2026-10-08", rules.joinedDate).from).toBe(WORK_TRACKING_ROLLOUT_DATE);
    expect(buildWorkLogReminders("2026-10-07", [], rules)).toMatchObject({ missingDates: [], latestEligibleDate: null, previousWeekMissing: [] });
    expect(buildWorkLogReminders("2026-10-08", [], rules)).toMatchObject({ missingDates: ["2026-10-07"], latestEligibleDate: "2026-10-07", previousWeekMissing: [] });
    expect(buildWorkLogReminders("2026-10-08", [submitted("2026-10-07")], rules).missingDates).toEqual([]);
    expect(buildWorkLogReminders("2026-10-06", [], rules).missingDates).toEqual([]);
  });

  it("uses the later join date and keeps future join dates ineligible", () => {
    const rules = { joinedDate: "2026-11-04" };
    expect(getWorkLogReminderWindow("2026-11-06", rules.joinedDate).from).toBe("2026-11-04");
    expect(buildWorkLogReminders("2026-11-06", [], rules).missingDates).toEqual(["2026-11-04", "2026-11-05"]);
    expect(buildWorkLogReminders("2026-11-03", [], rules).missingDates).toEqual([]);
  });

  it("includes only the current and previous week and excludes older days from every reminder", () => {
    const rules = { joinedDate: "2024-01-01" };
    expect(getWorkLogReminderWindow("2026-11-12", rules.joinedDate).from).toBe("2026-11-02");
    const data = { scope: "studio:user", ...buildWorkLogReminders("2026-11-12", [], rules) };
    expect(data.missingDates).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(data.previousWeekMissing).toEqual(data.missingDates.slice(0, 5));
    expect(takeWorkLogReminder(data, storage())).toMatchObject({ kind: "week", date: "2026-11-02", count: 5 });
    expect(isWorkLogReminderRelevant({ kind: "day", date: "2026-10-30", count: 1, yesterday: false }, data)).toBe(false);
    const filled = data.missingDates.map(submitted);
    const caughtUp = { scope: data.scope, ...buildWorkLogReminders(data.today, filled, rules) };
    expect(caughtUp.missingDates).toEqual([]);
    expect(takeWorkLogReminder(caughtUp, storage())).toBeNull();
  });

  it("preserves historical weekly totals and explicit statuses without historical catch-up reminders", () => {
    const rules = { joinedDate: "2024-01-01" };
    const entries = [{ activity_kind: "task", task_id: "task", review_round_id: null, minutes: 90, work_date: "2026-10-30" }];
    const oldWeek = buildWeeklyWorkLog("2026-10-30", "2026-11-12", entries, [submitted("2026-10-30")], new Map([["2026-10-30", 45]]), rules);
    expect(oldWeek.days.every(day => !day.missing)).toBe(true);
    expect(oldWeek.days[4]).toMatchObject({ submittedAt: "2026-10-30T12:00:00Z", taskMinutes: 90, calendarMinutes: 45, totalMinutes: 135 });
    expect(oldWeek.totals.totalMinutes).toBe(135);
    const beforeRollout = buildWeeklyWorkLog("2026-09-29", "2026-10-08", [], [submitted("2026-09-29")], new Map(), rules);
    expect(beforeRollout.days.every(day => !day.missing)).toBe(true);
    expect(beforeRollout.days[1].submittedAt).toBeTruthy();
  });

  it("uses submission state independently of task/review/Calendar hours, including a saved 0-hour day", () => {
    const entries = [{ activity_kind: "task", task_id: "task", review_round_id: null, minutes: 540, work_date: "2026-11-03" }];
    const week = buildWeeklyWorkLog("2026-11-04", "2026-11-05", entries, [submitted("2026-11-02")], new Map([["2026-11-04", 480]]), eligibility);
    expect(week.days[0]).toMatchObject({ submittedAt: "2026-11-02T12:00:00Z", totalMinutes: 0, missing: false });
    expect(week.days[1]).toMatchObject({ submittedAt: null, totalMinutes: 540, missing: true });
    expect(week.days[2]).toMatchObject({ submittedAt: null, calendarMinutes: 480, missing: true });
    expect(week.days[3].missing).toBe(false); // Today isn't overdue.
    expect(reminders("2026-11-05", ["2026-11-02"]).missingDates).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("matches the sum of the daily task, review and sourced Calendar totals", () => {
    const week = buildWeeklyWorkLog("2026-11-04", "2026-11-05", [
      { activity_kind: "task", task_id: "task", review_round_id: null, minutes: 90, work_date: "2026-11-02" },
      { activity_kind: "review", task_id: "task", review_round_id: "round", minutes: 25, work_date: "2026-11-02" },
      { activity_kind: "task", task_id: "task", review_round_id: null, minutes: 30, work_date: "2026-11-03" },
      { activity_kind: "task", task_id: "task", review_round_id: null, minutes: 999, work_date: "2026-10-28" },
    ], [submitted("2026-11-02"), submitted("2026-11-03")], new Map([["2026-11-02", 45], ["2026-11-03", 60]]), eligibility);
    expect(week.days[0]).toMatchObject({ taskMinutes: 90, reviewMinutes: 25, calendarMinutes: 45, totalMinutes: 160 });
    expect(week.totals).toEqual({ taskMinutes: 120, reviewMinutes: 25, calendarMinutes: 105, totalMinutes: 250 });
    expect(week.days.reduce((sum, day) => sum + day.totalMinutes, 0)).toBe(week.totals.totalMinutes);
  });

  it("skips before joining, weekends, studio days off and approved full-day absences", () => {
    const rules = { joinedDate: "2026-10-30", studioDaysOff: ["2026-11-02"], timeOff: [{ start_date: "2026-11-03", end_date: "2026-11-04" }] };
    const data = buildWorkLogReminders("2026-11-06", [], rules);
    expect(data.missingDates).toEqual(["2026-10-30", "2026-11-05"]);
    expect(data.latestEligibleDate).toBe("2026-11-05");
    expect(buildWorkLogReminders("2026-10-29", [], rules).missingDates).toEqual([]);
    const week = buildWeeklyWorkLog("2026-11-04", "2026-11-06", [], [], new Map(), rules);
    expect(week.days.slice(0, 4).map(day => [day.kind, day.missing])).toEqual([
      ["studio_day_off", false], ["time_off", false], ["time_off", false], ["day", true],
    ]);
  });

  it("reminds for the last eligible weekday after a weekend, without calling it yesterday", () => {
    const data = reminders("2026-11-09");
    expect(data.latestEligibleDate).toBe("2026-11-06");
    const session = storage();
    expect(takeWorkLogReminder(data, session)?.kind).toBe("week");
    // A later day can receive the daily reminder, but the week reminder isn't repeated.
    expect(takeWorkLogReminder({ ...data, today: "2026-11-10" }, session)).toMatchObject({ kind: "day", date: "2026-11-06", yesterday: false });
  });

  it("shows one toast per session/day, scopes it per account, and allows a new-day reminder", () => {
    const session = storage(), data = reminders("2026-11-05", ["2026-11-02"]);
    expect(takeWorkLogReminder(data, session)).toMatchObject({ kind: "day", date: "2026-11-04", count: 2, yesterday: true });
    expect(takeWorkLogReminder(data, session)).toBeNull();
    expect(takeWorkLogReminder({ ...data, scope: "studio:other" }, session)).not.toBeNull();
    expect(takeWorkLogReminder(reminders("2026-11-06"), session)).toMatchObject({ date: "2026-11-05" });
  });

  it("keeps older missing days in the indicator but doesn't nag if the latest eligible day is submitted", () => {
    expect(reminders("2026-11-05", ["2026-11-04"]).missingDates).toHaveLength(2);
    expect(takeWorkLogReminder(reminders("2026-11-05", ["2026-11-04"]), storage())).toBeNull();
    expect(takeWorkLogReminder(reminders("2026-11-02"), storage())).toBeNull();
  });

  it("invalidates a reminder after its day/week is caught up or the calendar makes it ineligible", () => {
    const reminder = { kind: "day" as const, date: "2026-11-04", count: 1, yesterday: true };
    expect(isWorkLogReminderRelevant(reminder, reminders("2026-11-05"))).toBe(true);
    expect(isWorkLogReminderRelevant(reminder, reminders("2026-11-05", ["2026-11-04"]))).toBe(false);
    expect(isWorkLogReminderRelevant(reminder, { scope: "studio:user", ...buildWorkLogReminders("2026-11-05", [], { ...eligibility, studioDaysOff: ["2026-11-04"] }) })).toBe(false);
    const weekly = { kind: "week" as const, date: "2026-11-02", count: 5, yesterday: false };
    expect(isWorkLogReminderRelevant(weekly, reminders("2026-11-09"))).toBe(true);
    expect(isWorkLogReminderRelevant(weekly, reminders("2026-11-09", ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]))).toBe(false);
  });
});
