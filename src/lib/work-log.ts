import { z } from "zod";
import { addCalendarDays, instantToDateOnly, startOfMondayWeek, zonedWallTimeToIso } from "@/lib/calendar";
import { getWorkdayKind, WORKDAY_KINDS } from "@/lib/workdays";
import { isActivityChange, isActivityChanges } from "@/lib/project-activity";
import { buildCalendarStatistics, calendarStatisticsAssignments, STATISTICS_CALENDAR_TYPES, type StatisticsCalendarEvent } from "@/lib/statistics-calendar";
import type { Database } from "@/types/database.types";
import { TASK_STAGES } from "@/lib/task-stages";

type Tables = Database["public"]["Tables"];
export type WorkLogEntry = Pick<Tables["work_log_entries"]["Row"], "activity_kind" | "task_id" | "review_round_id" | "minutes">
  & Partial<Pick<Tables["work_log_entries"]["Row"], "internal_activity_type">>;
export type ReviewStatisticsRound = Pick<Tables["task_review_rounds"]["Row"], "id" | "reviewer_id" | "completed_at" | "result"> & {
  reviewers: Array<Pick<Tables["task_review_round_reviewers"]["Row"], "reviewer_id" | "approved_at">>;
};
export type ReviewStatisticsSession = Pick<Tables["review_timer_sessions"]["Row"], "id" | "work_session_id" | "user_id" | "state" | "elapsed_us"> & {
  members: Array<Pick<Tables["review_timer_members"]["Row"], "round_id" | "finished_at">>;
};

const entryFields = z.object({
  activity_kind: z.enum(["task", "review", "internal"]), task_id: z.uuid().nullable(), review_round_id: z.uuid().nullable(),
  internal_activity_type: z.enum(["team_walkthrough"]).nullable().default(null),
  minutes: z.number().int().positive().max(2147483647),
});
export const workLogTimerSnapshotSchema = z.object({ entries: z.array(entryFields),
  timerSnapshot: z.record(z.uuid(), z.number().int().nonnegative()), changed: z.boolean(), studioId: z.uuid().nullable() });
const entrySchema = entryFields.refine(row => row.activity_kind === "internal"
  ? row.internal_activity_type !== null && row.task_id === null && row.review_round_id === null
  : row.internal_activity_type === null && row.task_id !== null && (row.activity_kind === "review") === (row.review_round_id !== null));
export const workLogInputSchema = z.object({
  date: z.iso.date(), entries: z.array(entrySchema), timerSnapshot: z.record(z.uuid(), z.number().int().nonnegative()).optional(),
}).refine(({ entries }) => new Set(entries.map(workLogRowKey)).size === entries.length);

const workLogProjectFields = {
  projectId: z.uuid().nullable(), stage: z.enum(TASK_STAGES).nullable(), stageName: z.string().nullable(),
};
const dailyRowSchema = entryFields.extend({
  ...workLogProjectFields,
  minutes: z.number().int().nonnegative(), title: z.string().nullable(), projectName: z.string().nullable(), roundNumber: z.number().nullable(),
});
export const dailyWorkLogSchema = z.object({
  canLogInternalWork: z.boolean().default(false),
  date: z.iso.date(), timerSnapshot: z.record(z.uuid(), z.number().int().nonnegative()).default({}), submittedAt: z.string().nullable(), rows: z.array(dailyRowSchema), additionalReviews: z.array(dailyRowSchema),
  activeTasks: z.array(z.object({ ...workLogProjectFields, id: z.uuid(), title: z.string(), projectName: z.string(), isParticipating: z.boolean() })),
  calendar: z.object({ minutes: z.number().nonnegative(), categories: z.array(z.object({ eventType: z.enum(STATISTICS_CALENDAR_TYPES), minutes: z.number().nonnegative(), allDayCount: z.number() })) }),
});

const timeSummarySchema = z.object({ internalMinutes: z.number().nonnegative().default(0), taskMinutes: z.number().nonnegative(), reviewMinutes: z.number().nonnegative(),
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
    const key = JSON.stringify(row.activity_kind === "internal"
      ? [row.activity_kind, row.internal_activity_type] : [row.activity_kind, row.projectId, row.stage]);
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
    reviewMinutes: sum.reviewMinutes + day.reviewMinutes, internalMinutes: sum.internalMinutes + day.internalMinutes, calendarMinutes: sum.calendarMinutes + day.calendarMinutes,
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

// Fixed production rollout date in the Work Log's Europe/Kyiv work-date timezone.
export const WORK_TRACKING_ROLLOUT_DATE = "2026-10-12";

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
    reviewMinutes: sum.reviewMinutes + day.reviewMinutes, internalMinutes: sum.internalMinutes + day.internalMinutes, calendarMinutes: sum.calendarMinutes + day.calendarMinutes,
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

export function workLogRowKey(row: Pick<WorkLogEntry, "task_id" | "review_round_id" | "internal_activity_type">) {
  if (row.internal_activity_type) return `internal:${row.internal_activity_type}`;
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

export type WorkLogActivity = Pick<Tables["project_activity"]["Row"], "action_type" | "entity_id" | "actor_id" | "changes">;

export function getSuggestedReviewRoundIds(rounds: SuggestedReviewRound[], userId: string, date: string,
  activities: WorkLogActivity[] = []) {
  const { end } = workLogDayBounds(date);
  const actedRounds = new Set(activities.flatMap(activity => {
    if (activity.actor_id !== userId || !isActivityChanges(activity.changes)) return [];
    const { review_round_id, review_action } = activity.changes;
    return typeof review_round_id === "string" && (review_action === "approved" || review_action === "rework") ? [review_round_id] : [];
  }));
  // Legacy approval timestamps lack the resolver's identity. Timer history is
  // merged separately; ambiguous legacy decisions remain manually addable.
  return rounds.filter(round => actedRounds.has(round.id) && Date.parse(round.submitted_at) < Date.parse(end)
    && round.reviewers.some(step => step.reviewer_id === userId)).map(round => round.id);
}

export function isTaskWorkPlausible(task: Pick<Tables["tasks"]["Row"], "completed_at" | "stage"> & {
  project: Pick<Tables["projects"]["Row"], "completed_at">;
}, date: string, activityInstant?: string) {
  // Workflow defaults use SQL current_date, while logs use Kyiv days. A real
  // event after Kyiv midnight can still have the preceding UTC completion date.
  const utcDate = activityInstant ? new Date(activityInstant).toISOString().slice(0, 10) : date;
  const effectiveDay = utcDate < date ? utcDate : date;
  return !(task.completed_at && task.completed_at < effectiveDay)
    && !(task.stage !== "stage_4" && task.project.completed_at && task.project.completed_at < effectiveDay);
}

/** Count decisions on their own dates, including handoffs in still-open rounds. */
export function completedReviewCredits(rounds: ReviewStatisticsRound[]) {
  const credits = new Map<string, { roundId: string; userId: string; completedAt: string }>();
  for (const round of rounds) {
    for (const step of round.reviewers) {
      if (step.approved_at) credits.set(`${round.id}:${step.reviewer_id}`, { roundId: round.id, userId: step.reviewer_id, completedAt: step.approved_at });
    }
    if (round.result === "rework" && round.completed_at) credits.set(`${round.id}:${round.reviewer_id}`, { roundId: round.id, userId: round.reviewer_id, completedAt: round.completed_at });
  }
  return [...credits.values()];
}

export function completedReviewSessions(sessions: ReviewStatisticsSession[]) {
  const groups = new Map<string, ReviewStatisticsSession[]>();
  for (const session of new Map(sessions.map(row => [row.id, row])).values()) {
    const key = `${session.user_id}:${session.work_session_id}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.values()].flatMap(intervals => {
    if (intervals.some(interval => interval.state !== "completed" || !interval.members.length || interval.members.some(member => !member.finished_at))
      || !intervals.some(interval => interval.elapsed_us > 0)) return [];
    const completedAt = intervals.flatMap(interval => interval.members.flatMap(member => member.finished_at ? [member.finished_at] : [])).sort().at(-1);
    return completedAt ? [{ sessionId: intervals[0].work_session_id, userId: intervals[0].user_id, completedAt }] : [];
  });
}

export function summarizeLoggedTime(entries: WorkLogEntry[], calendarMinutes = 0) {
  const taskMinutes = entries.filter(row => row.activity_kind === "task").reduce((sum, row) => sum + row.minutes, 0);
  const reviewMinutes = entries.filter(row => row.activity_kind === "review").reduce((sum, row) => sum + row.minutes, 0);
  const internalMinutes = entries.filter(row => row.activity_kind === "internal").reduce((sum, row) => sum + row.minutes, 0);
  return { taskMinutes, reviewMinutes, internalMinutes, calendarMinutes, totalMinutes: taskMinutes + reviewMinutes + internalMinutes + calendarMinutes };
}

export function buildWorkStatistics(entries: Array<WorkLogEntry & { id: string; user_id: string; work_date: string; project_id: string | null }>,
  rounds: ReviewStatisticsRound[], members: Array<{ id: string; name: string; active: boolean }>, range: { from: string; through: string },
  projects: Array<Pick<Tables["projects"]["Row"], "id" | "name">> = [], sessions: ReviewStatisticsSession[] = []) {
  const empty = () => ({ reviewsCompleted: 0, reviewSessionsCompleted: 0, taskMinutes: 0, reviewMinutes: 0, internalMinutes: 0, totalMinutes: 0 });
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
  for (const session of completedReviewSessions(sessions)) {
    const date = instantToDateOnly(session.completedAt);
    if (date < range.from || date > range.through) continue;
    person(session.userId).reviewSessionsCompleted++;
    const month = byMonth.get(date.slice(0, 7));
    if (month) month.reviewSessionsCompleted++;
  }
  for (const row of new Map(entries.map(entry => [entry.id, entry])).values()) {
    if (row.work_date < range.from || row.work_date > range.through) continue;
    const key = row.activity_kind === "internal" ? "internalMinutes" : row.activity_kind === "review" ? "reviewMinutes" : "taskMinutes";
    person(row.user_id)[key] += row.minutes;
    const month = byMonth.get(row.work_date.slice(0, 7));
    if (month) month[key] += row.minutes;
    if (row.activity_kind === "internal") continue;
    const projectKey = row.activity_kind === "review" ? "reviewMinutes" : "taskMinutes";
    let project = projectTime.get(row.project_id);
    if (!project) {
      project = { id: row.project_id, name: projectNames.get(row.project_id ?? "") ?? null, taskMinutes: 0, reviewMinutes: 0, totalMinutes: 0 };
      projectTime.set(row.project_id, project);
    }
    project[projectKey] += row.minutes;
    project.totalMinutes += row.minutes;
  }
  const employees = [...people.values()].filter(row => row.active || row.reviewsCompleted || row.reviewSessionsCompleted || row.taskMinutes || row.reviewMinutes || row.internalMinutes)
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const row of [...employees, ...months]) row.totalMinutes = row.taskMinutes + row.reviewMinutes + row.internalMinutes;
  const totals = employees.reduce((sum, row) => ({ reviewsCompleted: sum.reviewsCompleted + row.reviewsCompleted,
    reviewSessionsCompleted: sum.reviewSessionsCompleted + row.reviewSessionsCompleted,
    taskMinutes: sum.taskMinutes + row.taskMinutes, reviewMinutes: sum.reviewMinutes + row.reviewMinutes, internalMinutes: sum.internalMinutes + row.internalMinutes,
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

export function getSuggestedTaskIds(activities: WorkLogActivity[],
  userId: string, participatingTaskIds: Set<string>, inProgressTaskIds: string[] = []) {
  const worked: string[] = [];
  for (const activity of activities) {
    if (activity.action_type !== "task_updated" || activity.actor_id !== userId
      || !activity.entity_id || !participatingTaskIds.has(activity.entity_id)) continue;
    const changes = isActivityChanges(activity.changes) ? activity.changes : {};
    const status = isActivityChange(changes.status) ? changes.status : null;
    // Review decisions belong to review work. Creation and generic legacy
    // detail/checklist edits cannot reliably distinguish progress from metadata.
    const workflow = status && status.from !== "internal_review" && status.from !== status.to
      && ["in_progress", "internal_review", "review", "completed"].includes(String(status.to));
    const progress = isActivityChange(changes.production_completion)
      && changes.production_completion.from !== changes.production_completion.to;
    if (workflow || progress || isActivityChanges(changes.checklist_progress)) worked.push(activity.entity_id);
  }
  return [...new Set([...worked, ...inProgressTaskIds.filter(id => participatingTaskIds.has(id))])];
}
