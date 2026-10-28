import { describe, expect, it } from "vitest";
import { activityMonthBounds, buildTeamActivity, getTeamActivityDayState, groupTeamActivityItems, shiftActivityMonth, teamActivityReportSchema, type TeamActivityEntry, type TeamActivityTimer, type TeamActivityEvent } from "./team-activity";

const task = (id: string) => ({ id, title: `Task ${id}`, project_id: "project", project: { id: "project", name: "Project" } });
const entry = (id: string, date: string, minutes: number, taskId = "a"): TeamActivityEntry => ({
  id, user_id: "employee", work_date: date, minutes, activity_kind: "task", internal_activity_type: null, review_round_id: null, task: task(taskId),
});
function report(entries: TeamActivityEntry[] = [], options: { month?: string; submissions?: Array<{ user_id: string; work_date: string }>; timers?: TeamActivityTimer[]; events?: TeamActivityEvent[]; now?: string } = {}) {
  return buildTeamActivity({ month: "2026-10", today: "2026-10-16", workdayMinutes: 420,
    people: [{ id: "employee", name: "Employee", active: true }, { id: "empty", name: "Empty", active: true }, { id: "inactive", name: "Inactive", active: false }],
    entries, submissions: [], timers: [], now: "2026-10-16T12:00:00Z", ...options });
}

describe("team activity calendar", () => {
  const event = (id: string, changes: Partial<TeamActivityEvent> = {}): TeamActivityEvent => ({
    id, title: `Meeting ${id}`, event_type: "meeting", starts_at: "2026-10-07T09:00:00Z", ends_at: "2026-10-07T10:00:00Z",
    all_day: false, organizer_id: "employee", assignee_id: null, project_id: "project", project: task("a").project,
    cancelled_at: null, recurrence_rule: null, series_id: null, occurrence_start: null, compensates_time_off_request_id: null,
    invites: [], participants: [], ...changes,
  });

  it("counts completed project events with logged tasks and counts overlapping events once per person", () => {
    const first = event("a", { invites: [{ event_id: "a", user_id: "employee", status: "accepted" }] });
    const events = [first, first, event("b", { starts_at: "2026-10-07T09:30:00Z", ends_at: "2026-10-07T10:30:00Z" })];
    const day = teamActivityReportSchema.parse(report([entry("work", "2026-10-07", 330)], { events })).people[0].days[6];
    expect(day).toMatchObject({ recorded: true, minutes: 420 });
    expect(getTeamActivityDayState(day, 420)).toBe("target");
    expect(day.items.filter(item => item.activityKind === "calendar")).toMatchObject([
      { minutes: 60, calendarEvent: { id: "a", title: "Meeting a", project: { id: "project", name: "Project" } } },
      { minutes: 60, calendarEvent: { id: "b" } },
    ]);
  });

  it("uses event roles and excludes declined invites, cancelled, all-day, ongoing and makeup events", () => {
    const events = [event("declined", { organizer_id: "someone", invites: [{ event_id: "declined", user_id: "employee", status: "declined" }] }),
      event("cancelled", { cancelled_at: "2026-10-06T10:00:00Z" }), event("all-day", { all_day: true }),
      event("ongoing", { ends_at: "2026-10-08T09:00:00Z" }), event("makeup", { event_type: "work_makeup" }),
      event("unassigned", { event_type: "general" }),
      event("visit", { event_type: "site_visit", organizer_id: "someone", participants: [{ event_id: "visit", user_id: "employee" }] })];
    const day = report([], { events, now: "2026-10-07T12:00:00Z" }).people[0].days[6];
    expect(day).toMatchObject({ minutes: 60, recorded: true });
    expect(day.items.map(item => item.calendarEvent?.id)).toEqual(["visit"]);
  });

  it("materializes recurrence with moved and cancelled occurrences and clips at Kyiv midnight", () => {
    const parent = event("root", { recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 3 } });
    const events = [parent, event("cancelled", { series_id: "root", occurrence_start: "2026-10-08T09:00:00Z", cancelled_at: "2026-10-07T10:00:00Z" }),
      event("moved", { series_id: "root", occurrence_start: "2026-10-09T09:00:00Z", starts_at: "2026-10-10T20:30:00Z", ends_at: "2026-10-10T21:30:00Z" })];
    const days = report([], { events }).people[0].days;
    expect(days[6].minutes).toBe(60);
    expect(days[7].recorded).toBe(false);
    expect(days[8].recorded).toBe(false);
    expect(days[9].minutes).toBe(30);
    expect(days[10].minutes).toBe(30);
    expect(days.reduce((sum, day) => sum + day.minutes, 0)).toBe(120);
  });

  const review = (id: string, roundId: string, minutes: number): TeamActivityEntry => ({
    ...entry(id, "2026-10-03", minutes, roundId), activity_kind: "review", review_round_id: roundId,
  });
  const session = (id: string, roundIds: string[], options: Partial<TeamActivityTimer> = {}): TeamActivityTimer => ({
    id, work_session_id: id, user_id: "employee", state: "completed", started_at: "2026-10-03T09:00:00Z", paused_at: "2026-10-03T10:00:00Z",
    members: roundIds.map(round_id => ({ round_id, finished_at: "2026-10-03T10:00:00Z", round: { task: task(round_id) } })), ...options,
  });

  it("groups shared and resumed review sessions, keeps separate sessions apart and conserves recorded minutes across projects", () => {
    const a = review("1", "a", 47), b = review("2", "b", 48), c = review("3", "c", 9);
    b.task = { ...task("b"), project_id: "other-project", project: { id: "other-project", name: "Other project" } };
    const data = report([a, b, c, a], { timers: [session("shared", ["a", "b"]), session("resume", ["b"], { work_session_id: "shared" }), session("separate", ["c"])] });
    const day = teamActivityReportSchema.parse(data).people[0].days[2];
    const groups = groupTeamActivityItems(day.items);
    expect(day.minutes).toBe(104);
    expect(groups.map(group => [group.reviewSessionId, group.minutes, group.items.map(item => item.task?.id)])).toEqual([
      ["shared", 95, ["a", "b"]], ["separate", 9, ["c"]],
    ]);
    expect(groups[0].items.map(item => item.task?.project?.name)).toEqual(["Project", "Other project"]);
    expect(groups.flatMap(group => group.items).map(item => item.minutes)).toEqual([47, 48, 9]);
    expect(groups.reduce((sum, group) => sum + group.minutes, 0)).toBe(day.minutes);
  });

  it("leaves ambiguous or missing timer history separate, including different rounds of the same task", () => {
    const ambiguous = review("1", "a", 20), legacy = review("2", "legacy", 30), anotherRound = review("3", "another-round", 40);
    legacy.task = ambiguous.task;
    anotherRound.task = ambiguous.task;
    const day = report([ambiguous, legacy, anotherRound], { timers: [session("first", ["a"]), session("second", ["a"])] }).people[0].days[2];
    const groups = groupTeamActivityItems(day.items);
    expect(groups.map(group => [group.reviewSessionId, group.minutes])).toEqual([[null, 20], [null, 30], [null, 40]]);
    expect(day.minutes).toBe(90);
    expect(day.items.map(item => item.reviewRoundId)).toEqual(["a", "legacy", "another-round"]);
  });

  it("matches sessions by reviewer and Kyiv work date, treating midnight interval ends as exclusive", () => {
    const day = report([review("1", "a", 25)], { timers: [
      session("previous-day", ["a"], { started_at: "2026-10-02T20:00:00Z", paused_at: "2026-10-02T21:00:00Z" }),
      session("today", ["a"], { started_at: "2026-10-02T21:05:00Z", paused_at: "2026-10-02T22:00:00Z" }),
      session("another-reviewer", ["a"], { user_id: "someone-else" }),
      session("next-day", ["a"], { started_at: "2026-10-04T09:00:00Z", paused_at: "2026-10-04T10:00:00Z" }),
    ] }).people[0].days[2];
    expect(groupTeamActivityItems(day.items)[0]).toMatchObject({ reviewSessionId: "today", minutes: 25 });
  });

  it("sums actual minutes per employee/date and retains multiple tasks, reviews and internal work without double counting", () => {
    const a = entry("1", "2026-10-03", 90);
    const data = report([a, a, entry("2", "2026-10-03", 30), entry("3", "2026-10-03", 45, "b"),
      { ...entry("4", "2026-10-03", 15), activity_kind: "review" },
      { ...entry("5", "2026-10-03", 10), activity_kind: "internal", task: null, internal_activity_type: "team_walkthrough" },
      entry("6", "2026-10-04", 60)]);
    const days = data.people.find(person => person.id === "employee")!.days;
    expect(days[2]).toMatchObject({ date: "2026-10-03", recorded: true, minutes: 190 });
    expect(days[2].items.map(item => [item.task?.id ?? "internal", item.activityKind, item.minutes])).toEqual([
      ["a", "task", 120], ["b", "task", 45], ["a", "review", 15], ["internal", "internal", 10],
    ]);
    expect(days[3].minutes).toBe(60);
    expect(data.workdayMinutes).toBe(420);
  });

  it("keeps missing days neutral and distinguishes an explicit zero-hour submission", () => {
    const data = report([], { submissions: [{ user_id: "employee", work_date: "2026-10-02" }] });
    const days = data.people.find(person => person.id === "employee")!.days;
    expect(days[0]).toEqual({ date: "2026-10-01", kind: "day", weekend: false, recorded: false, minutes: 0, items: [], runningTasks: [] });
    expect(days[1]).toMatchObject({ date: "2026-10-02", recorded: true, minutes: 0 });
    expect(data.people.map(person => person.id)).toEqual(["employee", "empty"]);
    expect(data.people.find(person => person.id === "empty")!.days.every(day => !day.recorded)).toBe(true);
  });

  it.each([["2024-02", 29], ["2025-02", 28], ["2026-04", 30], ["2026-12", 31]] as const)("shows every day in %s and clips both month boundaries", (month, count) => {
    const { from, until } = activityMonthBounds(month);
    const data = report([entry("before", "2023-12-31", 999), entry("first", from, 30), entry("after", until, 999)], { month });
    const days = data.people.find(person => person.id === "employee")!.days;
    expect(days).toHaveLength(count);
    expect(days[0]).toMatchObject({ date: from, minutes: 30 });
    expect(days.at(-1)?.date).toBe(`${month}-${count}`);
    expect(days.reduce((sum, day) => sum + day.minutes, 0)).toBe(30);
  });

  it("uses stored Kyiv work dates unchanged at DST and year boundaries", () => {
    const days = report([entry("dst", "2026-10-25", 61), entry("last", "2026-10-31", 59)]).people[0].days;
    expect(days.find(day => day.date === "2026-10-25")?.minutes).toBe(61);
    expect(days.at(-1)?.minutes).toBe(59);
    expect(shiftActivityMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftActivityMonth("2026-01", -1)).toBe("2025-12");
  });

  it("marks only unfinished active timers on today without adding elapsed or historical time", () => {
    const timer: TeamActivityTimer = { ...session("timer", ["live"]), state: "active", started_at: "2026-10-16T09:00:00Z", paused_at: null, members: [{ round_id: "live", finished_at: null, round: { task: task("live") } }] };
    const timers = [timer, { ...timer, id: "paused", state: "paused" }, { ...timer, id: "finished", members: [{ round_id: "finished", finished_at: "2026-10-16T12:00:00Z", round: { task: task("finished") } }] }];
    const days = report([entry("logged", "2026-10-15", 60)], { timers }).people[0].days;
    expect(days[14].runningTasks).toEqual([]);
    expect(days[15]).toMatchObject({ recorded: false, minutes: 0, runningTasks: [task("live")] });
    expect(report([], { month: "2026-09", timers }).people[0].days.every(day => !day.runningTasks.length)).toBe(true);
  });

  it("retains inactive employees with monthly records and minutes without available task details", () => {
    const data = report([{ ...entry("1", "2026-10-03", 42), user_id: "inactive", task: null }]);
    expect(data.people.find(person => person.id === "inactive")?.days[2]).toMatchObject({ minutes: 42, items: [{ task: null, minutes: 42 }] });
  });

  it.each([
    { minutes: 0, recorded: false, expected: "missing" },
    { minutes: 0, recorded: true, expected: "under" },
    { minutes: 419, recorded: true, expected: "under" },
    { minutes: 420, recorded: true, expected: "target" },
    { minutes: 421, recorded: true, expected: "over" },
  ])("compares recorded $minutes minutes against the configured workday: $expected", ({ minutes, recorded, expected }) => {
    expect(getTeamActivityDayState({ kind: "day", minutes, recorded }, 420)).toBe(expected);
  });

  it.each(["weekend", "time_off", "studio_day_off", "before_joining"] as const)("never shows %s as a shortfall", kind => {
    expect(getTeamActivityDayState({ kind, minutes: 0, recorded: false }, 420)).toBe("excused");
    expect(getTeamActivityDayState({ kind, minutes: 0, recorded: true }, 420)).toBe("excused");
    expect(getTeamActivityDayState({ kind, minutes: 60, recorded: true }, 420)).toBe("worked");
  });

  it("preserves weekend identity with work, absence and a studio holiday, and reuses person avatars", () => {
    const data = buildTeamActivity({ month: "2026-10", today: "2026-10-16", workdayMinutes: 420,
      people: [{ id: "employee", name: "Employee", active: true, avatarUrl: "/avatar.png", joinedDate: "2026-10-02" }],
      entries: [entry("work", "2026-10-03", 60)], submissions: [], timers: [],
      timeOff: [{ user_id: "employee", start_date: "2026-10-03", end_date: "2026-10-05" }], studioDaysOff: ["2026-10-04", "2026-10-06"],
    });
    const person = data.people[0], days = person.days;
    expect(person.avatarUrl).toBe("/avatar.png");
    expect(days[0].kind).toBe("before_joining");
    expect(days[2]).toMatchObject({ kind: "time_off", weekend: true, minutes: 60 });
    expect(getTeamActivityDayState(days[2], 420)).toBe("worked");
    expect(days[3]).toMatchObject({ kind: "studio_day_off", weekend: true, recorded: false });
    expect(days[4]).toMatchObject({ kind: "time_off", weekend: false });
    expect(days[5]).toMatchObject({ kind: "studio_day_off", weekend: false });
    expect(days[9]).toMatchObject({ kind: "weekend", weekend: true, recorded: false });
    expect(days[6]).toMatchObject({ kind: "day", weekend: false });
  });
});
