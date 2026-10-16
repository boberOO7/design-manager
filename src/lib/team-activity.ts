import { z } from "zod";
import { addCalendarDays, instantToDateOnly } from "@/lib/calendar";
import { getWorkdayKind, WORKDAY_KINDS } from "@/lib/workdays";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
export const teamActivityMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(value => z.iso.date().safeParse(`${value}-01`).success);
const taskSchema = z.object({ id: z.string(), title: z.string(), project_id: z.string(), project: z.object({ id: z.string(), name: z.string() }).nullable() });
const itemSchema = z.object({ activityKind: z.string(), internalActivityType: z.string().nullable(), task: taskSchema.nullable(), minutes: z.number().nonnegative(), reviewRoundId: z.string().nullable(), reviewSessionId: z.string().nullable() });
export const teamActivityReportSchema = z.object({
  month: teamActivityMonthSchema, today: z.iso.date(), workdayMinutes: z.number().positive(),
  people: z.array(z.object({ id: z.string(), name: z.string(), active: z.boolean(), avatarUrl: z.string().nullable(), days: z.array(z.object({
    date: z.iso.date(), kind: z.enum(WORKDAY_KINDS), weekend: z.boolean(), recorded: z.boolean(), minutes: z.number().nonnegative(), items: z.array(itemSchema), runningTasks: z.array(taskSchema),
  })) })),
});
export type TeamActivityReport = z.infer<typeof teamActivityReportSchema>;
export type TeamActivityDay = TeamActivityReport["people"][number]["days"][number];

export function getTeamActivityDayState(day: Pick<TeamActivityDay, "kind" | "recorded" | "minutes">, workdayMinutes: number) {
  if (day.kind !== "day") return day.minutes > 0 ? "worked" : "excused";
  if (!day.recorded) return "missing";
  return day.minutes < workdayMinutes ? "under" : day.minutes > workdayMinutes ? "over" : "target";
}

export type TeamActivityDayState = ReturnType<typeof getTeamActivityDayState>;
type ActivityTask = z.infer<typeof taskSchema>;
export type TeamActivityEntry = Pick<Tables["work_log_entries"]["Row"], "id" | "user_id" | "work_date" | "activity_kind" | "internal_activity_type" | "minutes" | "review_round_id"> & { task: ActivityTask | null };
export type TeamActivityTimer = Pick<Tables["review_timer_sessions"]["Row"], "id" | "work_session_id" | "user_id" | "state" | "started_at" | "paused_at"> & {
  members: Array<Pick<Tables["review_timer_members"]["Row"], "round_id" | "finished_at"> & { round: { task: ActivityTask | null } | null }>;
};

export function groupTeamActivityItems(items: TeamActivityDay["items"]) {
  const groups: Array<{ reviewSessionId: string | null; items: TeamActivityDay["items"]; minutes: number }> = [];
  for (const item of items) {
    const sessionId = item.activityKind === "review" ? item.reviewSessionId : null;
    const group = sessionId ? groups.find(group => group.reviewSessionId === sessionId) : undefined;
    if (group) { group.items.push(item); group.minutes += item.minutes; }
    else groups.push({ reviewSessionId: sessionId, items: [item], minutes: item.minutes });
  }
  return groups;
}

export function shiftActivityMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function activityMonthBounds(month: string) {
  return { from: `${month}-01`, until: `${shiftActivityMonth(month, 1)}-01` };
}

export function buildTeamActivity({ month, today, workdayMinutes, people, entries, submissions, timers, timeOff = [], studioDaysOff = [] }: {
  month: string; today: string; workdayMinutes: number;
  people: Array<{ id: string; name: string; active: boolean; avatarUrl?: string | null; joinedDate?: string | null }>;
  entries: TeamActivityEntry[];
  submissions: Array<Pick<Tables["work_log_days"]["Row"], "user_id" | "work_date">>;
  timers: TeamActivityTimer[];
  timeOff?: Array<Pick<Tables["time_off_requests"]["Row"], "user_id" | "start_date" | "end_date">>;
  studioDaysOff?: string[];
}): TeamActivityReport {
  const { from, until } = activityMonthBounds(month);
  const dates: string[] = [];
  for (let date = from; date < until; date = addCalendarDays(date, 1)) dates.push(date);
  const rows = new Map(people.map(person => {
    const eligibility = { joinedDate: person.joinedDate ?? null, timeOff: timeOff.filter(period => period.user_id === person.id), studioDaysOff };
    return [person.id, { id: person.id, name: person.name, active: person.active, avatarUrl: person.avatarUrl ?? null, days: dates.map((date): TeamActivityDay => ({
      date, kind: getWorkdayKind(date, eligibility), weekend: getWorkdayKind(date, { joinedDate: null }) === "weekend",
      recorded: false, minutes: 0, items: [], runningTasks: [],
    })) }];
  }));
  const dayFor = (userId: string, date: string) => rows.get(userId)?.days.find(day => day.date === date);
  const reviewSessions = new Map<string, Set<string>>();
  for (const timer of timers) {
    const start = instantToDateOnly(timer.started_at);
    const end = timer.paused_at ? instantToDateOnly(new Date(Math.max(Date.parse(timer.started_at), Date.parse(timer.paused_at) - 1)).toISOString()) : today;
    for (const date of dates) {
      if (date < start || date > end) continue;
      for (const member of timer.members) {
        const key = `${timer.user_id}:${date}:${member.round_id}`;
        const sessions = reviewSessions.get(key) ?? new Set<string>();
        sessions.add(timer.work_session_id);
        reviewSessions.set(key, sessions);
      }
    }
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    const day = dayFor(entry.user_id, entry.work_date);
    if (!day || seen.has(entry.id)) continue;
    seen.add(entry.id);
    day.recorded = true;
    day.minutes += entry.minutes;
    const sessions = entry.activity_kind === "review" && entry.review_round_id
      ? reviewSessions.get(`${entry.user_id}:${entry.work_date}:${entry.review_round_id}`) : undefined;
    // Work Log merges sessions per round/day; ambiguous records cannot be split accurately.
    const reviewSessionId = sessions?.size === 1 ? [...sessions][0] : null;
    const item = entry.activity_kind !== "review" && day.items.find(item => item.activityKind === entry.activity_kind
      && item.task?.id === entry.task?.id && item.internalActivityType === entry.internal_activity_type);
    if (item) item.minutes += entry.minutes;
    else day.items.push({ activityKind: entry.activity_kind, internalActivityType: entry.internal_activity_type, task: entry.task, minutes: entry.minutes, reviewRoundId: entry.review_round_id, reviewSessionId });
  }
  for (const submission of submissions) {
    const day = dayFor(submission.user_id, submission.work_date);
    if (day) day.recorded = true;
  }
  // Live state is separate from recorded minutes; timer accounting already writes to the work log.
  for (const timer of timers) {
    if (timer.state !== "active" || today < instantToDateOnly(timer.started_at)) continue;
    const day = dayFor(timer.user_id, today);
    if (!day) continue;
    for (const member of timer.members) {
      const task = member.round?.task;
      if (!member.finished_at && task && !day.runningTasks.some(row => row.id === task.id)) day.runningTasks.push(task);
    }
  }
  return { month, today, workdayMinutes, people: [...rows.values()].filter(person => person.active
    || person.days.some(day => day.recorded || day.runningTasks.length > 0)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}
