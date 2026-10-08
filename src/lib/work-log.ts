import { z } from "zod";
import { addCalendarDays, instantToDateOnly, startOfMondayWeek, zonedWallTimeToIso } from "@/lib/calendar";
import { getWorkdayKind, WORKDAY_KINDS } from "@/lib/workdays";
import { isActivityChange, isActivityChanges } from "@/lib/project-activity";
import { buildCalendarStatistics, calendarStatisticsAssignments, STATISTICS_CALENDAR_TYPES, type StatisticsCalendarEvent } from "@/lib/statistics-calendar";
import type { Database, Json } from "@/types/database.types";
import { TASK_STAGES } from "@/lib/task-stages";

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

const workLogProjectFields = {
  projectId: z.uuid().nullable(), stage: z.enum(TASK_STAGES).nullable(), stageName: z.string().nullable(),
};
const dailyRowSchema = entryFields.extend({
  ...workLogProjectFields,
  minutes: z.number().int().nonnegative(), title: z.string().nullable(), projectName: z.string().nullable(), roundNumber: z.number().nullable(),
});
export const dailyWorkLogSchema = z.object({
  date: z.iso.date(), submittedAt: z.string().nullable(), rows: z.array(dailyRowSchema), additionalReviews: z.array(dailyRowSchema),
  activeTasks: z.array(z.object({ ...workLogProjectFields, id: z.uuid(), title: z.string(), projectName: z.string(), isParticipating: z.boolean() })),
  calendar: z.object({ minutes: z.number().nonnegative(), categories: z.array(z.object({ eventType: z.enum(STATISTICS_CALENDAR_TYPES), minutes: z.number().nonnegative(), allDayCount: z.number() })) }),
});

const timeSummarySchema = z.object({ taskMinutes: z.number().nonnegative(), reviewMinutes: z.number().nonnegative(),
  calendarMinutes: z.number().nonnegative(), totalMinutes: z.number().nonnegative() });
export const weeklyWorkLogSchema = z.object({
  start: z.iso.date(), through: z.iso.date(), today: z.iso.date(),
  days: z.array(timeSummarySchema.extend({ date: z.iso.date(), submittedAt: z.string().nullable(),
    kind: z.enum(WORKDAY_KINDS), missing: z.boolean() })),
  totals: timeSummarySchema,
});
export type WeeklyWorkLog = z.infer<typeof weeklyWorkLogSchema>;
export type WorkLogRow = z.infer<typeof dailyRowSchema>;

export function groupWorkLogRows(rows: WorkLogRow[]) {
  const groups = new Map<string, { key: string; projectName: string | null; stage: WorkLogRow["stage"]; stageName: string | null; rows: WorkLogRow[]; minutes: number }>();
  for (const row of rows) {
    const key = JSON.stringify([row.activity_kind, row.projectId, row.stage]);
    let group = groups.get(key);
    if (!group) {
      group = { key, projectName: row.projectName, stage: row.stage, stageName: row.stageName, rows: [], minutes: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.minutes += row.minutes;
  }
  return [...groups.values()];
}

export function parseWorkLogDuration(value: string) {
  const match = /^(\d{2,}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(minutes) && minutes <= 2147483647 ? minutes : null;
}

export function allocateReviewMinutes<T extends WorkLogEntry>(rows: T[], selectedKeys: string[], totalMinutes: number, confirmOverwrite = false) {
  const keys = new Set(selectedKeys);
  const selected = rows.filter(row => row.activity_kind === "review" && keys.has(workLogRowKey(row)));
  if (!selected.length || !Number.isSafeInteger(totalMinutes) || totalMinutes < 0 || totalMinutes > 2147483647) {
    return { status: "invalid" as const };
  }
  if (!confirmOverwrite && selected.some(row => row.minutes > 0)) return { status: "confirmationRequired" as const };
  const minutes = Math.floor(totalMinutes / selected.length), remainder = totalMinutes % selected.length;
  // Give remaining whole minutes to the first selected rows in their displayed order.
  const allocation = new Map(selected.map((row, index) => [workLogRowKey(row), minutes + (index < remainder ? 1 : 0)]));
  return { status: "applied" as const, rows: rows.map(row => {
    const allocated = allocation.get(workLogRowKey(row));
    return allocated === undefined ? row : { ...row, minutes: allocated };
  }) };
}

export function previewWorkLogWeek(week: WeeklyWorkLog, date: string, rows: WorkLogEntry[], calendarMinutes: number): WeeklyWorkLog {
  const days = week.days.map(day => day.date === date ? { ...day, ...summarizeLoggedTime(rows, calendarMinutes) } : day);
  const totals = days.reduce((sum, day) => ({ taskMinutes: sum.taskMinutes + day.taskMinutes,
    reviewMinutes: sum.reviewMinutes + day.reviewMinutes, calendarMinutes: sum.calendarMinutes + day.calendarMinutes,
    totalMinutes: sum.totalMinutes + day.totalMinutes }), summarizeLoggedTime([]));
  return { ...week, days, totals };
}
export const workLogRemindersSchema = z.object({
  scope: z.string(), today: z.iso.date(), missingDates: z.array(z.iso.date()), latestEligibleDate: z.iso.date().nullable(),
  previousWeek: z.iso.date(), previousWeekMissing: z.array(z.iso.date()),
});
export type WorkLogReminders = z.infer<typeof workLogRemindersSchema>;

export type WorkLogEligibility = Parameters<typeof getWorkdayKind>[1];
type SubmittedDay = Pick<Tables["work_log_days"]["Row"], "work_date" | "submitted_at">;

// Work Tracking was introduced on this Kyiv date (the original Work Log migration).
export const WORK_TRACKING_ROLLOUT_DATE = "2026-10-07";

export function getWorkLogReminderWindow(today: string, joinedDate: string | null) {
  const previousWeek = addCalendarDays(startOfMondayWeek(today), -7);
  const from = [WORK_TRACKING_ROLLOUT_DATE, joinedDate ?? today]
    .reduce((latest, date) => date > latest ? date : latest, previousWeek);
  return { from, previousWeek };
}

export function buildWeeklyWorkLog(date: string, today: string, entries: Array<WorkLogEntry & { work_date: string }>,
  submissions: SubmittedDay[], calendarMinutes: ReadonlyMap<string, number>, eligibility: WorkLogEligibility): WeeklyWorkLog {
  const start = startOfMondayWeek(date);
  const reminderWindow = getWorkLogReminderWindow(today, eligibility.joinedDate);
  const submitted = new Map(submissions.map(day => [day.work_date, day.submitted_at]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addCalendarDays(start, index);
    const submittedAt = submitted.get(day) ?? null;
    const kind = getWorkdayKind(day, eligibility);
    return { date: day, submittedAt, kind, missing: day >= reminderWindow.from && day < today && kind === "day" && submittedAt === null,
      ...summarizeLoggedTime(entries.filter(row => row.work_date === day), calendarMinutes.get(day) ?? 0) };
  });
  const totals = days.reduce((sum, day) => ({ taskMinutes: sum.taskMinutes + day.taskMinutes,
    reviewMinutes: sum.reviewMinutes + day.reviewMinutes, calendarMinutes: sum.calendarMinutes + day.calendarMinutes,
    totalMinutes: sum.totalMinutes + day.totalMinutes }), summarizeLoggedTime([]));
  return { start, through: addCalendarDays(start, 6), today, days, totals };
}

export function buildWorkLogReminders(today: string, submissions: SubmittedDay[], eligibility: WorkLogEligibility) {
  const submitted = new Set(submissions.map(day => day.work_date));
  const missingDates: string[] = [];
  let latestEligibleDate: string | null = null;
  const { from, previousWeek } = getWorkLogReminderWindow(today, eligibility.joinedDate);
  for (let day = from; day < today; day = addCalendarDays(day, 1)) {
    if (getWorkdayKind(day, eligibility) !== "day") continue;
    latestEligibleDate = day;
    if (!submitted.has(day)) missingDates.push(day);
  }
  const week = startOfMondayWeek(today);
  return { today, missingDates, latestEligibleDate, previousWeek,
    previousWeekMissing: missingDates.filter(day => day >= previousWeek && day < week) };
}

export function workLogRowKey(row: Pick<WorkLogEntry, "task_id" | "review_round_id">) {
  return row.review_round_id ? `review:${row.review_round_id}` : `task:${row.task_id}`;
}

export function isWorkLogDateEditable(date: string, today: string) {
  return date <= today;
}

export function workLogDayBounds(date: string) {
  return { start: zonedWallTimeToIso(`${date}T00:00`), end: zonedWallTimeToIso(`${addCalendarDays(date, 1)}T00:00`) };
}

type SuggestedReviewRound = Pick<Tables["task_review_rounds"]["Row"], "id" | "reviewer_id" | "submitted_at" | "completed_at"> & {
  reviewers: Array<Pick<Tables["task_review_round_reviewers"]["Row"], "reviewer_id" | "approved_at" | "position">>;
  task: Pick<Tables["tasks"]["Row"], "status" | "stage"> & { project: Pick<Tables["projects"]["Row"], "status" | "archived_at"> };
};

export function getSuggestedReviewRoundIds(rounds: SuggestedReviewRound[], userId: string, date: string) {
  const { start, end } = workLogDayBounds(date);
  const inDay = (instant: string | null) => instant !== null && Date.parse(instant) >= Date.parse(start) && Date.parse(instant) < Date.parse(end);
  return rounds.filter(round => {
    const ownStep = round.reviewers.find(step => step.reviewer_id === userId);
    if (!ownStep || Date.parse(round.submitted_at) >= Date.parse(end)) return false;
    const approvedToday = inDay(ownStep.approved_at);
    // Previous approvals establish when the current sequential step began.
    const activeSince = Math.max(Date.parse(round.submitted_at), ...round.reviewers
      .filter(step => step.position < ownStep.position && step.approved_at)
      .map(step => Date.parse(step.approved_at ?? round.submitted_at)));
    // Preserve actual same-day activity, including resolved rounds.
    if (approvedToday || (round.reviewer_id === userId
      && (inDay(round.completed_at) || (inDay(round.submitted_at) && activeSince < Date.parse(end))))) return true;
    // Only the current unresolved step carries into subsequent days.
    return round.completed_at === null && round.reviewer_id === userId && ownStep.approved_at === null
      && round.task.status === "internal_review" && !round.task.project.archived_at
      && round.task.project.status !== "archived"
      && (round.task.project.status !== "completed" || round.task.stage === "stage_4")
      && activeSince < Date.parse(end);
  }).map(round => round.id);
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

export function buildWorkStatistics(entries: Array<WorkLogEntry & { id: string; user_id: string; work_date: string; project_id: string | null }>,
  rounds: ReviewStatisticsRound[], members: Array<{ id: string; name: string; active: boolean }>, range: { from: string; through: string },
  projects: Array<Pick<Tables["projects"]["Row"], "id" | "name">> = []) {
  const empty = () => ({ reviewsCompleted: 0, taskMinutes: 0, reviewMinutes: 0, totalMinutes: 0 });
  const people = new Map(members.map(member => [member.id, { ...member, ...empty() }]));
  const projectNames = new Map(projects.map(project => [project.id, project.name]));
  const projectTime = new Map<string | null, { id: string | null; name: string | null; taskMinutes: number; reviewMinutes: number; totalMinutes: number }>();
  const months = [];
  for (let month = `${range.from.slice(0, 7)}-01`; month <= range.through;) {
    months.push({ month, ...empty() });
    const [year, number] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  }
  const byMonth = new Map(months.map(month => [month.month.slice(0, 7), month]));
  const person = (id: string) => {
    let row = people.get(id);
    if (!row) { row = { id, name: "", active: false, ...empty() }; people.set(id, row); }
    return row;
  };
  for (const credit of completedReviewCredits(rounds)) {
    const date = instantToDateOnly(credit.completedAt);
    if (date < range.from || date > range.through) continue;
    person(credit.userId).reviewsCompleted++;
    const month = byMonth.get(date.slice(0, 7));
    if (month) month.reviewsCompleted++;
  }
  for (const row of new Map(entries.map(entry => [entry.id, entry])).values()) {
    if (row.work_date < range.from || row.work_date > range.through) continue;
    const key = row.activity_kind === "review" ? "reviewMinutes" : "taskMinutes";
    person(row.user_id)[key] += row.minutes;
    let project = projectTime.get(row.project_id);
    if (!project) {
      project = { id: row.project_id, name: projectNames.get(row.project_id ?? "") ?? null, taskMinutes: 0, reviewMinutes: 0, totalMinutes: 0 };
      projectTime.set(row.project_id, project);
    }
    project[key] += row.minutes;
    project.totalMinutes += row.minutes;
    const month = byMonth.get(row.work_date.slice(0, 7));
    if (month) month[key] += row.minutes;
  }
  const employees = [...people.values()].filter(row => row.active || row.reviewsCompleted || row.taskMinutes || row.reviewMinutes)
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const row of [...employees, ...months]) row.totalMinutes = row.taskMinutes + row.reviewMinutes;
  const totals = employees.reduce((sum, row) => ({ reviewsCompleted: sum.reviewsCompleted + row.reviewsCompleted,
    taskMinutes: sum.taskMinutes + row.taskMinutes, reviewMinutes: sum.reviewMinutes + row.reviewMinutes,
    totalMinutes: sum.totalMinutes + row.totalMinutes }), empty());
  const projectRows = [...projectTime.values()].sort((left, right) => right.totalMinutes - left.totalMinutes
    || (left.name ?? "").localeCompare(right.name ?? "") || (left.id ?? "").localeCompare(right.id ?? ""));
  return { employees, months, totals, projects: projectRows };
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
