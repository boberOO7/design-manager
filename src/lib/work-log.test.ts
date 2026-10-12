import { instantToDateOnly } from "./calendar";
import { describe, expect, it } from "vitest";
import { buildWorkStatistics, completedReviewCredits, completedReviewSessions, type ReviewStatisticsSession, getDailyCalendarContext, isWorkLogDateEditable, isTaskWorkPlausible, getSuggestedTaskIds, getSuggestedReviewRoundIds, summarizeLoggedTime, workLogDayBounds, workLogInputSchema, type ReviewStatisticsRound } from "./work-log";
import { buildCalendarStatistics, calendarStatisticsAssignments, type StatisticsCalendarEvent } from "./statistics-calendar";
import { statisticsPeriods, statisticsRange } from "./statistics";

const taskId = "82000000-0000-4000-8000-000000000001";
const roundId = "82000000-0000-4000-8000-000000000002";
const round = (changes: Partial<ReviewStatisticsRound> = {}): ReviewStatisticsRound => ({
  id: roundId, reviewer_id: "reviewer", completed_at: "2026-10-07T10:00:00Z", result: "approved",
  reviewers: [{ reviewer_id: "reviewer", approved_at: changes.completed_at === undefined ? "2026-10-07T10:00:00Z" : changes.completed_at }], ...changes,
});
const event = (changes: Partial<StatisticsCalendarEvent & { assignee_id: string | null }> = {}): StatisticsCalendarEvent & { assignee_id: string | null } => ({
  id: "meeting", event_type: "meeting", starts_at: "2026-10-07T06:00:00Z", ends_at: "2026-10-07T07:00:00Z", all_day: false,
  project_id: null, organizer_id: "reviewer", assignee_id: null, cancelled_at: null, recurrence_rule: null, series_id: null,
  occurrence_start: null, compensates_time_off_request_id: null, ...changes,
});
const entry = (changes: Partial<Parameters<typeof buildWorkStatistics>[0][number]> = {}): Parameters<typeof buildWorkStatistics>[0][number] => ({
  id: "entry", user_id: "worker", work_date: "2026-10-07", activity_kind: "task", task_id: taskId, project_id: "project", review_round_id: null, minutes: 60, ...changes,
});

describe("work log domain", () => {
  it("counts ten reviewed steps as one shared work session across pauses and resumes", () => {
    const finished_at = "2026-10-07T10:00:00Z";
    const members = Array.from({ length: 10 }, (_, index) => ({ round_id: `round-${index}`, finished_at }));
    const session: ReviewStatisticsSession = { id: "interval-1", work_session_id: "shared", user_id: "reviewer", state: "completed", elapsed_us: 60_000_000, members };
    const resumed = { ...session, id: "interval-2", elapsed_us: 120_000_000 };
    expect(completedReviewSessions([session, session, resumed])).toHaveLength(1);
    expect(completedReviewSessions([session, { ...resumed, state: "paused", members: [{ round_id: "round-0", finished_at: null }] }])).toEqual([]);
    const report = buildWorkStatistics([], members.map(member => round({ id: member.round_id })), [], { from: "2026-10-01", through: "2026-10-07" }, [], [session, resumed]);
    expect(report.totals).toMatchObject({ reviewsCompleted: 10, reviewSessionsCompleted: 1 });
    expect(report.employees[0]).toMatchObject({ reviewsCompleted: 10, reviewSessionsCompleted: 1 });
    expect(report.months[0]).toMatchObject({ reviewsCompleted: 10, reviewSessionsCompleted: 1 });
    expect(buildWorkStatistics([], [], [], { from: "2026-09-01", through: "2026-09-30" }, [], [session, resumed]).totals.reviewSessionsCompleted).toBe(0);
  });

  it("credits each sequential step on its own date while excluding waiting reviewers", () => {
    const review = round({ completed_at: null, result: null, reviewer_id: "next", reviewers: [
      { reviewer_id: "reviewer", approved_at: "2026-09-30T20:00:00Z" }, { reviewer_id: "next", approved_at: null },
    ] });
    expect(completedReviewCredits([review])).toEqual([{ roundId, userId: "reviewer", completedAt: "2026-09-30T20:00:00Z" }]);
    expect(buildWorkStatistics([], [review], [], { from: "2026-09-01", through: "2026-09-30" }).totals.reviewsCompleted).toBe(1);
    expect(buildWorkStatistics([], [review], [], { from: "2026-10-01", through: "2026-10-07" }).totals.reviewsCompleted).toBe(0);
  });

  it("groups task and review minutes by project once, including unavailable project details", () => {
    const first = entry({ minutes: 91 });
    const report = buildWorkStatistics([first, first,
      entry({ id: "collaborator", user_id: "collaborator", minutes: 29 }),
      entry({ id: "review-1", user_id: "reviewer", activity_kind: "review", review_round_id: roundId, minutes: 35 }),
      entry({ id: "task-2", task_id: "active-task", project_id: "active-project", minutes: 60 }),
      entry({ id: "review-2", task_id: "active-task", project_id: "active-project", user_id: "reviewer", activity_kind: "review", review_round_id: "round-2", minutes: 120 }),
      entry({ id: "missing", project_id: null, minutes: 15 }),
      entry({ id: "outside", project_id: "outside-project", work_date: "2026-09-30", minutes: 999 }),
    ], [round(), round({ id: "round-2" })], [], { from: "2026-10-01", through: "2026-10-07" }, [
      { id: "project", name: "Completed project" }, { id: "active-project", name: "Active project" }, { id: "idle", name: "No time" },
    ]);
    expect(report.projects).toEqual([
      { id: "active-project", name: "Active project", taskMinutes: 60, reviewMinutes: 120, totalMinutes: 180 },
      { id: "project", name: "Completed project", taskMinutes: 120, reviewMinutes: 35, totalMinutes: 155 },
      { id: null, name: null, taskMinutes: 15, reviewMinutes: 0, totalMinutes: 15 },
    ]);
    for (const key of ["taskMinutes", "reviewMinutes", "totalMinutes"] as const) {
      expect(report.projects.reduce((sum, project) => sum + project[key], 0)).toBe(report.totals[key]);
      expect(report.employees.reduce((sum, person) => sum + person[key], 0)).toBe(report.totals[key]);
    }
    expect(report.totals.totalMinutes).toBe(350);
  });

  it("keeps time for known project IDs with missing metadata and adds none for completed reviews without logs", () => {
    const range = { from: "2026-10-01", through: "2026-10-07" };
    expect(buildWorkStatistics([entry()], [], [], range).projects).toEqual([
      { id: "project", name: null, taskMinutes: 60, reviewMinutes: 0, totalMinutes: 60 },
    ]);
    const withoutLogs = buildWorkStatistics([], [round()], [], range, [{ id: "project", name: "Project" }]);
    expect(withoutLogs.projects).toEqual([]);
    expect(withoutLogs.totals).toMatchObject({ totalMinutes: 0, reviewsCompleted: 1 });
  });

  it("preserves whole minutes before display rounding", () => {
    const report = buildWorkStatistics([entry({ minutes: 1 }), entry({ id: "review", activity_kind: "review", review_round_id: roundId, minutes: 1 })],
      [], [], { from: "2026-10-01", through: "2026-10-07" });
    expect(report.totals).toMatchObject({ taskMinutes: 1, reviewMinutes: 1, totalMinutes: 2 });
    expect(report.months[0].totalMinutes).toBe(2);
  });

  it("requires a specific round for reviews and rejects duplicate or fractional entries", () => {
    const row = { activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 60 };
    expect(workLogInputSchema.safeParse({ date: "2026-10-07", entries: [row] }).success).toBe(true);
    for (const entries of [[row, row], [{ ...row, minutes: 0 }], [{ ...row, minutes: 1.5 }], [{ ...row, activity_kind: "review" }], [{ ...row, review_round_id: roundId }]]) {
      expect(workLogInputSchema.safeParse({ date: "2026-10-07", entries }).success).toBe(false);
    }
    expect(workLogInputSchema.safeParse({ date: "2026-02-30", entries: [] }).success).toBe(false);
  });

  it("credits completed rounds separately to actual reviewers, including rework and sequential approvals", () => {
    expect(completedReviewCredits([round({ completed_at: null })])).toEqual([]);
    const completed = round({ result: "rework", reviewer_id: "second", reviewers: [
      { reviewer_id: "reviewer", approved_at: "2026-10-07T09:00:00Z" }, { reviewer_id: "second", approved_at: null },
      { reviewer_id: "waiting", approved_at: null },
    ] });
    expect(completedReviewCredits([completed, completed]).map(row => row.userId)).toEqual(["reviewer", "second"]);
    const entries = [entry({ user_id: "reviewer", activity_kind: "review", review_round_id: roundId, minutes: 25 })];
    const report = buildWorkStatistics([...entries, ...entries], [completed], [], { from: "2026-10-01", through: "2026-10-07" });
    expect(report.employees.find(row => row.id === "reviewer")).toMatchObject({ reviewsCompleted: 1, taskMinutes: 0, reviewMinutes: 25 });
    expect(report.employees[0]).not.toHaveProperty("completedTasks");
    expect(report.employees[0]).not.toHaveProperty("areaM2");
    expect(buildWorkStatistics(entries, [completed], [], { from: "2026-09-01", through: "2026-09-30" }).employees).toEqual([]);
  });

  it("attributes task time to each logger and review time to its logger for each specific round", () => {
    const task = entry({ minutes: 90 });
    const report = buildWorkStatistics([task, task, entry({ id: "collaborator", user_id: "collaborator", minutes: 30 }),
      entry({ id: "review-1", user_id: "reviewer", activity_kind: "review", review_round_id: roundId, minutes: 25 }),
      entry({ id: "review-2", user_id: "reviewer", activity_kind: "review", review_round_id: "round-2", minutes: 35 }),
    ], [round(), round({ id: "round-2", completed_at: null, result: null })], [], { from: "2026-10-01", through: "2026-10-07" });
    expect(report.employees.find(row => row.id === "worker")).toMatchObject({ taskMinutes: 90, reviewMinutes: 0, reviewsCompleted: 0 });
    expect(report.employees.find(row => row.id === "collaborator")).toMatchObject({ taskMinutes: 30, reviewMinutes: 0 });
    expect(report.employees.find(row => row.id === "reviewer")).toMatchObject({ taskMinutes: 0, reviewMinutes: 60, reviewsCompleted: 1 });
    expect(report.totals).toEqual({ internalMinutes: 0, taskMinutes: 120, reviewMinutes: 60, totalMinutes: 180, reviewsCompleted: 1, reviewSessionsCompleted: 0 });
    expect(report.months[0]).toMatchObject(report.totals);
  });

  it.each(statisticsPeriods)("clips work dates and Kyiv review completion dates to the %s period, inclusively", period => {
    const range = statisticsRange(period, "2026-10-07", "2024-02-15");
    const before = new Date(Date.parse(range.from) - 86_400_000).toISOString().slice(0, 10);
    const atStart = `${before}T22:00:00Z`; // After midnight Kyiv, including winter UTC+2.
    const atEnd = "2026-10-07T20:59:59Z";
    const rounds = [round({ id: "before", completed_at: `${before}T20:00:00Z` }), round({ id: "start", completed_at: atStart }),
      round({ id: "end", completed_at: atEnd }), round({ id: "after", completed_at: "2026-10-07T21:00:00Z" })];
    const report = buildWorkStatistics([
      entry({ id: "before", work_date: before, minutes: 999 }), entry({ id: "start", work_date: range.from, minutes: 30 }),
      entry({ id: "end", work_date: range.through, minutes: 60 }), entry({ id: "after", work_date: "2026-10-08", minutes: 999 }),
    ], rounds, [], range);
    expect(report.totals).toMatchObject({ taskMinutes: 90, reviewsCompleted: 2 });
    expect(report.months.reduce((sum, month) => sum + month.totalMinutes, 0)).toBe(90);
    expect(report.projects.reduce((sum, project) => sum + project.totalMinutes, 0)).toBe(90);
    expect(report.months.reduce((sum, month) => sum + month.reviewsCompleted, 0)).toBe(2);
    expect(report.months[0].month).toBe(range.from);
  });

  it("keeps Calendar participation separate from logged work, preserving both sources' period boundaries", () => {
    const range = { from: "2026-09-01", through: "2026-10-01" };
    const now = "2026-10-02T12:00:00Z";
    const spanning = event({ id: "spanning", starts_at: "2026-09-30T20:00:00Z", ends_at: "2026-10-01T02:00:00Z" });
    const rows = [spanning, spanning,
      event({ id: "clipped", starts_at: "2026-08-31T20:00:00Z", ends_at: "2026-09-01T01:00:00Z" }),
      event({ id: "makeup", event_type: "work_makeup", starts_at: "2026-09-10T09:00:00Z", ends_at: "2026-09-10T10:00:00Z" }),
      event({ id: "all-day", all_day: true, starts_at: "2026-09-10T21:00:00Z", ends_at: "2026-09-11T21:00:00Z" }),
      event({ id: "cancelled", cancelled_at: now, starts_at: "2026-09-10T09:00:00Z", ends_at: "2026-09-10T10:00:00Z" }),
      event({ id: "general", event_type: "general", starts_at: "2026-09-10T09:00:00Z", ends_at: "2026-09-10T10:00:00Z" }),
      event({ id: "ongoing", starts_at: "2026-10-01T09:00:00Z", ends_at: "2026-10-03T10:00:00Z" }),
      event({ id: "future", starts_at: "2026-10-03T09:00:00Z", ends_at: "2026-10-03T10:00:00Z" }),
    ];
    const invites = [
      { event_id: "spanning", user_id: "reviewer", status: "accepted" as const },
      { event_id: "spanning", user_id: "worker", status: "pending" as const },
      { event_id: "spanning", user_id: "declined", status: "declined" as const },
    ];
    const members = [{ id: "reviewer", name: "Reviewer", active: true }, { id: "worker", name: "Worker", active: false }, { id: "idle", name: "Idle", active: true }];
    const calendar = buildCalendarStatistics(rows, [], range, now, { members, assignments: calendarStatisticsAssignments(rows, invites, []) });
    const logged = [entry({ work_date: "2026-09-10", minutes: 90 }),
      entry({ id: "review", user_id: "reviewer", work_date: "2026-10-01", activity_kind: "review", review_round_id: roundId, minutes: 30 })];
    const report = buildWorkStatistics([...logged, ...logged], [round({ completed_at: "2026-10-01T09:00:00Z" })], members, range);
    expect(calendar.totals.hours).toBe(11); // Event durations, including unassigned general activity.
    expect(calendar.people.find(row => row.id === "reviewer")?.hours).toBe(10);
    expect(calendar.people.find(row => row.id === "worker")?.hours).toBe(6);
    expect(report.totals).toEqual({ internalMinutes: 0, taskMinutes: 90, reviewMinutes: 30, totalMinutes: 120, reviewsCompleted: 1, reviewSessionsCompleted: 0 });
    expect(report.totals).not.toHaveProperty("calendarMinutes");
    expect(report.employees.find(row => row.id === "reviewer")).toMatchObject({ reviewMinutes: 30, totalMinutes: 30 });
    expect(report.employees.find(row => row.id === "worker")).toMatchObject({ taskMinutes: 90, totalMinutes: 90, active: false });
    expect(report.employees.find(row => row.id === "idle")?.totalMinutes).toBe(0);
    expect(report.months).toMatchObject([
      { month: "2026-09-01", taskMinutes: 90, reviewMinutes: 0, totalMinutes: 90 },
      { month: "2026-10-01", taskMinutes: 0, reviewMinutes: 30, totalMinutes: 30 },
    ]);
    expect(report.months.reduce((sum, row) => sum + row.totalMinutes, 0)).toBe(report.totals.totalMinutes);
  });

  it("suggests participating-task interactions and workflow changes", () => {
    const participating = new Set(["edited", "moved", "idle", "unrelated"]);
    const activities = [
      { action_type: "task_updated", entity_id: "edited", actor_id: "reviewer", changes: { checklist_progress: { is_completed: { from: false, to: true } } } },
      { action_type: "task_updated", entity_id: "moved", actor_id: "admin", changes: { status: { from: "todo", to: "in_progress" } } },
      { action_type: "task_updated", entity_id: "review-task", actor_id: "reviewer", changes: { status: { from: "internal_review", to: "review" } } },
      { action_type: "task_updated", entity_id: "unrelated", actor_id: "admin", changes: { priority: { from: "low", to: "high" } } },
    ];
    expect(getSuggestedTaskIds(activities, "reviewer", participating, [])).toEqual(["edited"]);
  });

  it("also suggests participating in-progress tasks without daily activity, without duplicates or foreign tasks", () => {
    const participating = new Set(["assigned", "collaborating", "edited"]);
    const inProgress = ["assigned", "collaborating", "edited", "foreign"];
    expect(getSuggestedTaskIds([], "reviewer", participating, inProgress))
      .toEqual(["assigned", "collaborating", "edited"]);
    expect(getSuggestedTaskIds([
      { action_type: "task_updated", entity_id: "edited", actor_id: "reviewer", changes: { checklist_progress: { is_completed: { from: false, to: true } } } },
    ], "reviewer", participating, inProgress))
      .toEqual(["edited", "assigned", "collaborating"]);
  });

  it("does not suggest other employees' tasks after the user moves or edits them", () => {
    const activities = [
      ...["in_progress", "internal_review", "review", "completed"].map(status => ({
        action_type: "task_updated", entity_id: `foreign-${status}`, actor_id: "reviewer", changes: { status: { from: "todo", to: status } },
      })),
      { action_type: "task_updated", entity_id: "foreign-edited", actor_id: "reviewer", changes: { checklist_progress: { is_completed: { from: false, to: true } } } },
      { action_type: "task_updated", entity_id: "assigned", actor_id: "reviewer", changes: { checklist_progress: { is_completed: { from: false, to: true } } } },
      { action_type: "task_updated", entity_id: "collaborating", actor_id: "reviewer", changes: { checklist_progress: { is_completed: { from: false, to: true } } } },
    ];
    expect(getSuggestedTaskIds(activities, "reviewer", new Set(["assigned", "collaborating"])))
      .toEqual(["assigned", "collaborating"]);
  });

  it("adds canonical Calendar minutes once despite duplicate rows and multiple participant roles", () => {
    const meeting = event();
    const context = getDailyCalendarContext([meeting, meeting, event({ id: "trip", event_type: "business_trip", all_day: true }), event({ id: "future", starts_at: "2026-10-07T18:00:00Z", ends_at: "2026-10-07T19:00:00Z" })],
      [{ event_id: "meeting", user_id: "reviewer", status: "accepted" }], [{ event_id: "trip", user_id: "reviewer" }], "reviewer", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(context.minutes).toBe(60);
    const total = summarizeLoggedTime([{ activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 90 },
      { activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 30 }], context.minutes);
    expect(total).toEqual({ internalMinutes: 0, taskMinutes: 90, reviewMinutes: 30, calendarMinutes: 60, totalMinutes: 180 });
  });

  it("keeps recurrence overrides and Kyiv day boundaries canonical", () => {
    const parent = event({ recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 2 } });
    const moved = event({ id: "override", series_id: parent.id, occurrence_start: parent.starts_at, starts_at: "2026-10-08T06:00:00Z", ends_at: "2026-10-08T07:00:00Z" });
    expect(getDailyCalendarContext([parent, moved], [], [], "reviewer", "2026-10-07", "2026-10-09T12:00:00Z").minutes).toBe(0);
    expect(workLogDayBounds("2026-10-07")).toEqual({ start: "2026-10-06T21:00:00.000Z", end: "2026-10-07T21:00:00.000Z" });
  });
});


describe("pending review suggestions", () => {
  const pending = (changes: Partial<Parameters<typeof getSuggestedReviewRoundIds>[0][number]> = {}): Parameters<typeof getSuggestedReviewRoundIds>[0][number] => ({
    id: roundId, reviewer_id: "reviewer", submitted_at: "2026-10-07T10:00:00Z", completed_at: null,
    reviewers: [{ reviewer_id: "reviewer", approved_at: null, position: 0 }],
    task: { status: "internal_review", stage: "stage_1", project: { status: "active", archived_at: null } }, ...changes,
  });
  it("does not suggest untouched waiting reviews on submission or subsequent days", () => {
    expect(getSuggestedReviewRoundIds([pending()], "reviewer", "2026-10-06")).toEqual([]);
    for (const date of ["2026-10-07", "2026-10-08", "2026-10-12"]) {
      expect(getSuggestedReviewRoundIds([pending()], "reviewer", date)).toEqual([]);
    }
  });
  it("does not infer work from a sequential reviewer handoff", () => {
    const waiting = pending({ reviewer_id: "first", reviewers: [
      { reviewer_id: "first", approved_at: null, position: 0 }, { reviewer_id: "reviewer", approved_at: null, position: 1 },
    ] });
    expect(getSuggestedReviewRoundIds([waiting], "reviewer", "2026-10-08")).toEqual([]);
    const active = pending({ reviewers: [
      { reviewer_id: "first", approved_at: "2026-10-09T10:00:00Z", position: 0 }, { reviewer_id: "reviewer", approved_at: null, position: 1 },
    ] });
    expect(getSuggestedReviewRoundIds([active], "reviewer", "2026-10-07")).toEqual([]);
    expect(getSuggestedReviewRoundIds([active], "reviewer", "2026-10-08")).toEqual([]);
    expect(getSuggestedReviewRoundIds([active], "reviewer", "2026-10-09")).toEqual([]);
  });
  it("preserves same-day completion activity but stops carrying closed or approved reviews", () => {
    const closed = pending({ completed_at: "2026-10-08T10:00:00Z" });
    expect(getSuggestedReviewRoundIds([closed], "reviewer", "2026-10-08", [{ action_type: "task_updated", entity_id: taskId, actor_id: "reviewer", changes: { review_round_id: roundId, review_action: "rework" } }])).toEqual([roundId]);
    expect(getSuggestedReviewRoundIds([closed], "reviewer", "2026-10-09")).toEqual([]);
    const approvedStep = pending({ reviewer_id: "second", reviewers: [
      { reviewer_id: "reviewer", approved_at: "2026-10-08T10:00:00Z", position: 0 }, { reviewer_id: "second", approved_at: null, position: 1 },
    ] });
    expect(getSuggestedReviewRoundIds([approvedStep], "reviewer", "2026-10-08", [{ action_type: "task_updated", entity_id: taskId, actor_id: "reviewer", changes: { review_round_id: roundId, review_action: "approved" } }])).toEqual([roundId]);
    expect(getSuggestedReviewRoundIds([approvedStep], "reviewer", "2026-10-09")).toEqual([]);
  });
  it("does not treat queue eligibility as actual review activity", () => {
    const base = pending();
    for (const task of [
      { ...base.task, status: "in_progress" as const },
      { ...base.task, project: { ...base.task.project, archived_at: "2026-10-08T10:00:00Z" } },
      { ...base.task, project: { ...base.task.project, status: "completed" as const } },
    ]) expect(getSuggestedReviewRoundIds([pending({ task })], "reviewer", "2026-10-09")).toEqual([]);
    expect(getSuggestedReviewRoundIds([pending({ task: { ...base.task, stage: "stage_4", project: { ...base.task.project, status: "completed" } } })], "reviewer", "2026-10-09")).toEqual([]);
  });
});


describe("editable Work Log dates", () => {
  it("allows historical days and today, and rejects future dates across month and year boundaries", () => {
    for (const date of ["2025-12-31", "2026-01-01", "2026-10-07", "2026-10-08"]) {
      expect(isWorkLogDateEditable(date, "2026-10-08")).toBe(true);
    }
    for (const date of ["2026-10-09", "2026-11-01", "2027-01-01"]) {
      expect(isWorkLogDateEditable(date, "2026-10-08")).toBe(false);
    }
  });
  it("uses the Kyiv day rather than the UTC day at midnight", () => {
    const today = instantToDateOnly("2026-10-08T21:30:00Z");
    expect(today).toBe("2026-10-09");
    expect(isWorkLogDateEditable("2026-10-09", today)).toBe(true);
    expect(isWorkLogDateEditable("2026-10-10", today)).toBe(false);
  });
});

it("counts internal work separately without project, review, or productivity credit", () => {
  const internal = entry({ activity_kind: "internal", task_id: null, project_id: null, internal_activity_type: "team_walkthrough", minutes: 45 });
  expect(workLogInputSchema.safeParse({ date: internal.work_date, entries: [internal] }).success).toBe(true);
  expect(workLogInputSchema.safeParse({ date: internal.work_date, entries: [{ ...internal, task_id: taskId }] }).success).toBe(false);
  expect(workLogInputSchema.safeParse({ date: internal.work_date, entries: [{ ...internal, internal_activity_type: null }] }).success).toBe(false);
  const report = buildWorkStatistics([internal, internal], [], [], { from: "2026-10-01", through: "2026-10-07" });
  expect(report.totals).toEqual({ taskMinutes: 0, reviewMinutes: 0, internalMinutes: 45, totalMinutes: 45, reviewsCompleted: 0, reviewSessionsCompleted: 0 });
  expect(report.months[0]).toMatchObject(report.totals);
  expect(report.employees[0]).toMatchObject(report.totals);
  expect(report.projects).toEqual([]);
  expect(summarizeLoggedTime([internal], 30)).toEqual({ taskMinutes: 0, reviewMinutes: 0, internalMinutes: 45, calendarMinutes: 30, totalMinutes: 75 });
});

it("excludes creation, metadata, ambiguous legacy edits and other actors from task work", () => {
  const activity = { action_type: "task_updated", entity_id: taskId, actor_id: "worker", changes: {} };
  const ids = new Set([taskId]);
  for (const changes of [{ priority: { from: "low", to: "high" } }, { completed_at: { from: "2026-10-07", to: "2026-05-20" } },
    { work_details_updated: true }, { checklist_item: "item", operation: "INSERT" },
    { status: { from: "internal_review", to: "completed" } }]) {
    expect(getSuggestedTaskIds([{ ...activity, changes }], "worker", ids)).toEqual([]);
  }
  expect(getSuggestedTaskIds([{ ...activity, action_type: "task_created", changes: { status: "completed" } }], "worker", ids)).toEqual([]);
  expect(getSuggestedTaskIds([{ ...activity, actor_id: "admin", changes: { status: { from: "in_progress", to: "completed" } } }], "worker", ids)).toEqual([]);
  for (const changes of [{ status: { from: "in_progress", to: "internal_review" } }, { status: { from: "review", to: "completed" } },
    { production_completion: { from: "50", to: "100" } }, { checklist_progress: { is_completed: { from: false, to: true } } }]) {
    expect(getSuggestedTaskIds([{ ...activity, changes }], "worker", ids)).toEqual([taskId]);
  }
});

it("uses historical completion only to suppress mismatched suggestions, never to invent work", () => {
  const task = { completed_at: null, stage: "stage_1" as const, project: { completed_at: "2026-05-20" } };
  expect(isTaskWorkPlausible(task, "2026-10-08")).toBe(false);
  expect(isTaskWorkPlausible({ ...task, stage: "stage_4" }, "2026-10-08")).toBe(true);
  expect(isTaskWorkPlausible({ ...task, completed_at: "2026-05-20", project: { completed_at: null } }, "2026-10-08")).toBe(false);
  expect(isTaskWorkPlausible({ ...task, completed_at: "2026-10-08", project: { completed_at: null } }, "2026-10-08")).toBe(true);
  expect(getSuggestedTaskIds([], "worker", new Set([taskId]))).toEqual([]);
});

it("retains actual Kyiv-midnight workflow events whose SQL completion default is the UTC date", () => {
  const task = { stage: "stage_1" as const, completed_at: "2026-10-07", project: { completed_at: "2026-10-07" } };
  expect(isTaskWorkPlausible(task, "2026-10-08", "2026-10-07T21:30:00Z")).toBe(true);
  expect(isTaskWorkPlausible(task, "2026-10-08", "2026-10-08T12:00:00Z")).toBe(false);
  expect(isTaskWorkPlausible({ ...task, completed_at: "2026-05-20" }, "2026-10-08", "2026-10-07T21:30:00Z")).toBe(false);
});
