import { describe, expect, it } from "vitest";
import { buildWorkStatistics, completedReviewCredits, getDailyCalendarContext, getSuggestedTaskIds, summarizeLoggedTime, workLogDayBounds, workLogInputSchema, type ReviewStatisticsRound } from "./work-log";
import type { StatisticsCalendarEvent } from "./statistics-calendar";

const taskId = "82000000-0000-4000-8000-000000000001";
const roundId = "82000000-0000-4000-8000-000000000002";
const round = (changes: Partial<ReviewStatisticsRound> = {}): ReviewStatisticsRound => ({
  id: roundId, reviewer_id: "reviewer", completed_at: "2026-10-07T10:00:00Z", result: "approved",
  reviewers: [{ reviewer_id: "reviewer", approved_at: "2026-10-07T10:00:00Z" }], ...changes,
});
const event = (changes: Partial<StatisticsCalendarEvent & { assignee_id: string | null }> = {}): StatisticsCalendarEvent & { assignee_id: string | null } => ({
  id: "meeting", event_type: "meeting", starts_at: "2026-10-07T06:00:00Z", ends_at: "2026-10-07T07:00:00Z", all_day: false,
  project_id: null, organizer_id: "reviewer", assignee_id: null, cancelled_at: null, recurrence_rule: null, series_id: null,
  occurrence_start: null, compensates_time_off_request_id: null, ...changes,
});

describe("work log domain", () => {
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
    const entries = [{ id: "entry", user_id: "reviewer", work_date: "2026-10-07", activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 25 }];
    const report = buildWorkStatistics([...entries, ...entries], [completed], [], { from: "2026-10-01", through: "2026-10-07" });
    expect(report.find(row => row.id === "reviewer")).toMatchObject({ reviewsCompleted: 1, taskMinutes: 0, reviewMinutes: 25 });
    expect(report[0]).not.toHaveProperty("completedTasks");
    expect(report[0]).not.toHaveProperty("areaM2");
    expect(buildWorkStatistics(entries, [completed], [], { from: "2026-09-01", through: "2026-09-30" })).toEqual([]);
  });

  it("suggests participating-task interactions and workflow changes", () => {
    const participating = new Set(["edited", "moved", "idle", "unrelated"]);
    const activities = [
      { entity_id: "edited", actor_id: "reviewer", changes: { checklist_item: "item" } },
      { entity_id: "moved", actor_id: "admin", changes: { status: { from: "todo", to: "in_progress" } } },
      { entity_id: "review-task", actor_id: "reviewer", changes: { status: { from: "internal_review", to: "review" } } },
      { entity_id: "unrelated", actor_id: "admin", changes: { priority: { from: "low", to: "high" } } },
    ];
    expect(getSuggestedTaskIds(activities, "reviewer", participating, new Set(["review-task"]))).toEqual(["edited", "moved"]);
  });

  it("also suggests participating in-progress tasks without daily activity, without duplicates or foreign tasks", () => {
    const participating = new Set(["assigned", "collaborating", "edited"]);
    const inProgress = ["assigned", "collaborating", "edited", "foreign"];
    expect(getSuggestedTaskIds([], "reviewer", participating, new Set(), inProgress))
      .toEqual(["assigned", "collaborating", "edited"]);
    expect(getSuggestedTaskIds([
      { entity_id: "edited", actor_id: "reviewer", changes: { checklist_item: "item" } },
    ], "reviewer", participating, new Set(), inProgress))
      .toEqual(["edited", "assigned", "collaborating"]);
  });

  it("does not suggest other employees' tasks after the user moves or edits them", () => {
    const activities = [
      ...["in_progress", "internal_review", "review", "completed"].map(status => ({
        entity_id: `foreign-${status}`, actor_id: "reviewer", changes: { status: { from: "todo", to: status } },
      })),
      { entity_id: "foreign-edited", actor_id: "reviewer", changes: { checklist_item: "item" } },
      { entity_id: "assigned", actor_id: "reviewer", changes: { checklist_item: "item" } },
      { entity_id: "collaborating", actor_id: "reviewer", changes: { checklist_item: "item" } },
    ];
    expect(getSuggestedTaskIds(activities, "reviewer", new Set(["assigned", "collaborating"]), new Set()))
      .toEqual(["assigned", "collaborating"]);
  });

  it("adds canonical Calendar minutes once despite duplicate rows and multiple participant roles", () => {
    const meeting = event();
    const context = getDailyCalendarContext([meeting, meeting, event({ id: "trip", event_type: "business_trip", all_day: true }), event({ id: "future", starts_at: "2026-10-07T18:00:00Z", ends_at: "2026-10-07T19:00:00Z" })],
      [{ event_id: "meeting", user_id: "reviewer", status: "accepted" }], [{ event_id: "trip", user_id: "reviewer" }], "reviewer", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(context.minutes).toBe(60);
    const total = summarizeLoggedTime([{ activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 90 },
      { activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 30 }], context.minutes);
    expect(total).toEqual({ taskMinutes: 90, reviewMinutes: 30, calendarMinutes: 60, totalMinutes: 180 });
  });

  it("keeps recurrence overrides and Kyiv day boundaries canonical", () => {
    const parent = event({ recurrence_rule: { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: 2 } });
    const moved = event({ id: "override", series_id: parent.id, occurrence_start: parent.starts_at, starts_at: "2026-10-08T06:00:00Z", ends_at: "2026-10-08T07:00:00Z" });
    expect(getDailyCalendarContext([parent, moved], [], [], "reviewer", "2026-10-07", "2026-10-09T12:00:00Z").minutes).toBe(0);
    expect(workLogDayBounds("2026-10-07")).toEqual({ start: "2026-10-06T21:00:00.000Z", end: "2026-10-07T21:00:00.000Z" });
  });
});
