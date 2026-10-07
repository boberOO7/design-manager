import { z } from "zod";
import { addCalendarDays, instantToDateOnly, zonedWallTimeToIso } from "@/lib/calendar";
import { isActivityChange, isActivityChanges } from "@/lib/project-activity";
import { buildCalendarStatistics, calendarStatisticsAssignments, STATISTICS_CALENDAR_TYPES, type StatisticsCalendarEvent } from "@/lib/statistics-calendar";
import type { Database, Json } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
export type WorkLogEntry = Pick<Tables["work_log_entries"]["Row"], "activity_kind" | "task_id" | "review_round_id" | "minutes">;
export type ReviewStatisticsRound = Pick<Tables["task_review_rounds"]["Row"], "id" | "reviewer_id" | "completed_at" | "result"> & {
  reviewers: Array<Pick<Tables["task_review_round_reviewers"]["Row"], "reviewer_id" | "approved_at">>;
};

const entryFields = z.object({
  activity_kind: z.enum(["task", "review"]), task_id: z.uuid(), review_round_id: z.uuid().nullable(),
  minutes: z.number().int().positive().max(2147483647),
});
const entrySchema = entryFields.refine(row => (row.activity_kind === "review") === (row.review_round_id !== null));
export const workLogInputSchema = z.object({
  date: z.iso.date(), entries: z.array(entrySchema),
}).refine(({ entries }) => new Set(entries.map(workLogRowKey)).size === entries.length);

const dailyRowSchema = entryFields.extend({
  minutes: z.number().int().nonnegative(), title: z.string().nullable(), projectName: z.string().nullable(), roundNumber: z.number().nullable(),
});
export const dailyWorkLogSchema = z.object({
  date: z.iso.date(), rows: z.array(dailyRowSchema), additionalReviews: z.array(dailyRowSchema),
  activeTasks: z.array(z.object({ id: z.uuid(), title: z.string(), projectName: z.string(), isParticipating: z.boolean() })),
  calendar: z.object({ minutes: z.number().nonnegative(), categories: z.array(z.object({ eventType: z.enum(STATISTICS_CALENDAR_TYPES), minutes: z.number().nonnegative(), allDayCount: z.number() })) }),
});

export function workLogRowKey(row: Pick<WorkLogEntry, "task_id" | "review_round_id">) {
  return row.review_round_id ? `review:${row.review_round_id}` : `task:${row.task_id}`;
}

export function workLogDayBounds(date: string) {
  return { start: zonedWallTimeToIso(`${date}T00:00`), end: zonedWallTimeToIso(`${addCalendarDays(date, 1)}T00:00`) };
}

/** A completed round credits each reviewer who actually resolved their step,
 * including the reviewer returning it for rework. Waiting reviewers earn no count.
 */
export function completedReviewCredits(rounds: ReviewStatisticsRound[]) {
  const credits = new Map<string, { roundId: string; userId: string; completedAt: string }>();
  for (const round of rounds) {
    if (!round.completed_at) continue;
    const reviewers = new Set(round.reviewers.filter(row => row.approved_at).map(row => row.reviewer_id));
    if (round.result === "rework") reviewers.add(round.reviewer_id);
    for (const userId of reviewers) credits.set(`${round.id}:${userId}`, { roundId: round.id, userId, completedAt: round.completed_at });
  }
  return [...credits.values()];
}

export function summarizeLoggedTime(entries: WorkLogEntry[], calendarMinutes = 0) {
  const taskMinutes = entries.filter(row => row.activity_kind === "task").reduce((sum, row) => sum + row.minutes, 0);
  const reviewMinutes = entries.filter(row => row.activity_kind === "review").reduce((sum, row) => sum + row.minutes, 0);
  return { taskMinutes, reviewMinutes, calendarMinutes, totalMinutes: taskMinutes + reviewMinutes + calendarMinutes };
}

export function buildWorkStatistics(entries: Array<WorkLogEntry & { id: string; user_id: string; work_date: string }>,
  rounds: ReviewStatisticsRound[], members: Array<{ id: string; name: string; active: boolean }>, range: { from: string; through: string }) {
  const people = new Map(members.map(member => [member.id, { ...member, reviewsCompleted: 0, taskMinutes: 0, reviewMinutes: 0 }]));
  const person = (id: string) => {
    let row = people.get(id);
    if (!row) { row = { id, name: "", active: false, reviewsCompleted: 0, taskMinutes: 0, reviewMinutes: 0 }; people.set(id, row); }
    return row;
  };
  for (const credit of completedReviewCredits(rounds)) {
    const date = instantToDateOnly(credit.completedAt);
    if (date >= range.from && date <= range.through) person(credit.userId).reviewsCompleted++;
  }
  for (const row of new Map(entries.map(entry => [entry.id, entry])).values()) {
    if (row.work_date < range.from || row.work_date > range.through) continue;
    if (row.activity_kind === "review") person(row.user_id).reviewMinutes += row.minutes;
    else person(row.user_id).taskMinutes += row.minutes;
  }
  return [...people.values()].filter(row => row.active || row.reviewsCompleted || row.taskMinutes || row.reviewMinutes)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getDailyCalendarContext(events: Array<StatisticsCalendarEvent & { assignee_id: string | null }>,
  invites: Array<Pick<Tables["calendar_event_invites"]["Row"], "event_id" | "user_id" | "status">>,
  participants: Array<Pick<Tables["calendar_event_participants"]["Row"], "event_id" | "user_id">>,
  userId: string, date: string, now: string,
) {
  const assignments = calendarStatisticsAssignments(events, invites, participants).filter(row => row.personId === userId);
  // Keep templates for moved overrides, but discard occurrences assigned to others.
  const report = buildCalendarStatistics(events, [], { from: date, through: date }, now,
    { members: [{ id: userId, name: "", active: true }], assignments });
  const person = report.people.find(row => row.id === userId);
  const categories = (person?.categories ?? []).map(category => ({
    eventType: category.eventType, minutes: category.hours * 60, allDayCount: category.allDayCount,
  })).filter(row => row.minutes > 0 || row.allDayCount > 0);
  return { minutes: (person?.hours ?? 0) * 60, categories };
}

export function getSuggestedTaskIds(activities: Array<{ entity_id: string | null; actor_id: string | null; changes: Json }>,
  userId: string, participatingTaskIds: Set<string>, reviewTaskIds: Set<string>, inProgressTaskIds: string[] = []) {
  const interacted: string[] = [], transitioned: string[] = [];
  for (const activity of activities) {
    if (!activity.entity_id || !participatingTaskIds.has(activity.entity_id)) continue;
    const changes = isActivityChanges(activity.changes) ? activity.changes : {};
    const status = isActivityChange(changes.status) ? changes.status : null;
    // Resolving a review is reviewer activity, not task production work.
    const reviewResolution = reviewTaskIds.has(activity.entity_id) && status?.from === "internal_review";
    if (activity.actor_id === userId && !reviewResolution) interacted.push(activity.entity_id);
    else if (status && status.to !== "todo" && status.to !== "cancelled") transitioned.push(activity.entity_id);
  }
  return [...new Set([...interacted, ...transitioned, ...inProgressTaskIds.filter(id => participatingTaskIds.has(id))])];
}
