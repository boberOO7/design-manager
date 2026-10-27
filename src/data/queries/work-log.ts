import "server-only";

import { reviewTimerSyncSchema } from "@/lib/review-timer";

import { resolveActiveStudioMembership, type ActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getMyTaskStageNames } from "@/data/queries/tasks";
import { loadAllRows } from "@/data/queries/all-rows";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, instantToDateOnly, startOfMondayWeek } from "@/lib/calendar";
import { workLogTimerSnapshotSchema, buildWeeklyWorkLog, buildWorkLogReminders, completedReviewCredits, completedReviewSessions, dailyWorkLogSchema, getDailyCalendarContext, getSuggestedReviewRoundIds, getSuggestedTaskIds, isTaskWorkPlausible, getWorkLogReminderWindow, summarizeLoggedTime, workLogDayBounds, workLogRowKey } from "@/lib/work-log";

type Client = Awaited<ReturnType<typeof createClient>>;
function loadWorkLogCalendar(client: Client, studioId: string) {
  return loadAllRows((from, to) => client.from("calendar_events")
    .select("id,event_type,starts_at,ends_at,all_day,project_id,organizer_id,assignee_id,cancelled_at,recurrence_rule,series_id,occurrence_start,compensates_time_off_request_id,invites:calendar_event_invites(event_id,user_id,status),participants:calendar_event_participants(event_id,user_id)")
    .eq("studio_id", studioId).order("id").range(from, to));
}

async function loadWorkLogEligibility(client: Client, membership: ActiveStudioMembership, from: string | null, through: string) {
  let joinedAt = membership.joined_at;
  if (!joinedAt) {
    const profile = await client.from("profiles").select("created_at").eq("id", membership.authenticatedUserId).single();
    if (profile.error) throw new Error("Unable to load membership date.", { cause: profile.error });
    joinedAt = profile.data.created_at;
  }
  const joinedDate = instantToDateOnly(joinedAt);
  const start = from ?? getWorkLogReminderWindow(through, joinedDate).from;
  const [absences, daysOff] = await Promise.all([
    loadAllRows((first, last) => client.from("time_off_requests").select("start_date,end_date")
      .eq("studio_id", membership.studio_id).eq("user_id", membership.authenticatedUserId)
      .eq("status", "approved").eq("all_day", true).is("cancelled_at", null)
      .lte("start_date", through).gte("end_date", start).order("id").range(first, last)),
    loadAllRows((first, last) => client.from("studio_days_off").select("date")
      .eq("studio_id", membership.studio_id).gte("date", start).lte("date", through).order("date").range(first, last)),
  ]);
  if (absences.error || daysOff.error) throw new Error("Unable to load work calendar.", { cause: absences.error ?? daysOff.error });
  return { joinedDate, timeOff: absences.data ?? [], studioDaysOff: (daysOff.data ?? []).map(day => day.date) };
}

export async function getDailyWorkLog(date: string) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { studio_id: studioId, authenticatedUserId: userId } = access.membership;
  const client = await createClient();
  const persisted = await client.rpc("get_work_log_timer_snapshot", { p_work_date: date });
  if (persisted.error) throw new Error("Unable to synchronize review time.", { cause: persisted.error });
  const logSnapshot = workLogTimerSnapshotSchema.parse(persisted.data);
  const { start, end } = workLogDayBounds(date);
  const [saved, activities, tasks, rounds, events, submission, statusPeriods] = await Promise.all([
    loadAllRows((from, to) => client.from("work_log_entries")
      .select("internal_activity_type,activity_kind,task_id,review_round_id,minutes,task:tasks(title,project_id,stage,project:projects(name)),round:task_review_rounds!work_log_entries_review_round_id_task_id_fkey(round_number)")
      .eq("studio_id", studioId).eq("user_id", userId).eq("work_date", date).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("project_activity").select("action_type,entity_id,actor_id,changes,created_at").eq("actor_id", userId)
      .eq("studio_id", studioId).eq("entity_type", "task").gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false }).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("tasks")
      .select("id,title,status,assignee_id,project_id,stage,completed_at,created_at,project:projects!tasks_project_id_fkey!inner(studio_id,name,status,archived_at,completed_at),collaborators:task_collaborators(user_id)")
      .eq("project.studio_id", studioId).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("task_review_rounds")
      .select("id,task_id,round_number,reviewer_id,submitted_at,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at,position),task:tasks!inner(title,status,project_id,stage,project:projects!tasks_project_id_fkey!inner(studio_id,name,status,archived_at,completed_at))")
      .eq("task.project.studio_id", studioId).lt("submitted_at", end)
      .order("id").range(from, to)),
    loadWorkLogCalendar(client, studioId),
    client.from("work_log_days").select("submitted_at").eq("studio_id", studioId).eq("user_id", userId).eq("work_date", date).maybeSingle(),
    loadAllRows((from, to) => client.from("task_status_periods").select("task_id,entered_at,exited_at")
      .eq("studio_id", studioId).eq("status", "in_progress").lt("entered_at", end)
      .or(`exited_at.is.null,exited_at.gt.${start}`).order("id").range(from, to)),
  ]);
  if (submission.error) throw new Error("Unable to load work log submission.", { cause: submission.error });
  for (const result of [saved, activities, tasks, rounds, events, statusPeriods]) {
    if (result.error || !result.data) throw new Error("Unable to load daily work log.", { cause: result.error });
  }
  const taskRows = tasks.data ?? [], reviewRows = rounds.data ?? [];
  const participating = new Set(taskRows.filter(task => task.assignee_id === userId || task.collaborators.some(row => row.user_id === userId)).map(task => task.id));
  const activeTasks = taskRows.filter(task => task.status !== "completed" && task.status !== "cancelled"
    && !task.project.archived_at && task.project.status !== "archived"
    && (task.project.status !== "completed" || task.stage === "stage_4"));
  const suggestedReviewIds = new Set(getSuggestedReviewRoundIds(reviewRows, userId, date, activities.data ?? []));
  for (const roundId of Object.keys(logSnapshot.timerSnapshot)) suggestedReviewIds.add(roundId);
  const relevantReviews = reviewRows.filter(round => suggestedReviewIds.has(round.id));
  const byTask = new Map(taskRows.map(task => [task.id, task]));
  const plausibleTaskIds = new Set(taskRows.filter(task => participating.has(task.id) && isTaskWorkPlausible(task, date)).map(task => task.id));
  const inProgressOnDate = new Set((statusPeriods.data ?? []).map(period => period.task_id));
  // Current open status remains a useful today-only fallback when legacy
  // transition history is missing. Past dates require a recorded status period.
  const workActivities = (activities.data ?? []).filter(activity => {
    const task = activity.entity_id ? byTask.get(activity.entity_id) : null;
    return task && isTaskWorkPlausible(task, date, activity.created_at);
  });
  const suggestedIds = getSuggestedTaskIds(workActivities, userId, participating,
    activeTasks.filter(task => plausibleTaskIds.has(task.id) && task.status === "in_progress" && task.created_at < end
      && (inProgressOnDate.has(task.id) || date === instantToDateOnly(new Date().toISOString()))).map(task => task.id));
  const savedByKey = new Map((saved.data ?? []).map(row => [workLogRowKey(row), row]));
  const byRound = new Map(reviewRows.map(round => [round.id, round]));
  const rows = [
    ...logSnapshot.entries.map(entry => {
      const row = savedByKey.get(workLogRowKey(entry));
      const task = entry.task_id ? byTask.get(entry.task_id) : null;
      const round = entry.review_round_id ? byRound.get(entry.review_round_id) : null;
      return { ...entry, projectId: row?.task?.project_id ?? task?.project_id ?? null, stage: row?.task?.stage ?? task?.stage ?? null,
        title: row?.task?.title ?? task?.title ?? null, projectName: row?.task?.project?.name ?? task?.project.name ?? null,
        roundNumber: row?.round?.round_number ?? round?.round_number ?? null };
    }),
    ...suggestedIds.flatMap(id => {
      const task = byTask.get(id);
      return task ? [{ internal_activity_type: null, activity_kind: "task", task_id: id, review_round_id: null, minutes: 0, projectId: task.project_id, stage: task.stage, title: task.title, projectName: task.project.name, roundNumber: null }] : [];
    }),
    ...relevantReviews.map(round => ({ internal_activity_type: null, activity_kind: "review", task_id: round.task_id, review_round_id: round.id, minutes: 0,
      projectId: round.task.project_id, stage: round.task.stage, title: round.task.title, projectName: round.task.project.name, roundNumber: round.round_number })),
  ];
  const rowByKey = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!rowByKey.has(workLogRowKey(row))) rowByKey.set(workLogRowKey(row), row);
  const uniqueRows = [...rowByKey.values()];
  const additionalReviews = reviewRows.filter(round => round.reviewers.some(row => row.reviewer_id === userId))
    .map(round => ({ internal_activity_type: null, activity_kind: "review", task_id: round.task_id, review_round_id: round.id, minutes: 0,
      projectId: round.task.project_id, stage: round.task.stage, title: round.task.title, projectName: round.task.project.name, roundNumber: round.round_number }));
  const stageNames = await getMyTaskStageNames([...new Set([
    ...uniqueRows.map(row => row.projectId), ...additionalReviews.map(row => row.projectId), ...taskRows.map(task => task.project_id),
  ].filter((id): id is string => id !== null))]);
  const withStageName = <T extends { projectId: string | null; stage: string | null }>(row: T) => ({
    ...row, stageName: row.projectId && row.stage ? stageNames[`${row.projectId}:${row.stage}`] ?? null : null,
  });
  const calendarEvents = events.data ?? [];
  const calendar = getDailyCalendarContext(calendarEvents, calendarEvents.flatMap(row => row.invites),
    calendarEvents.flatMap(row => row.participants), userId, date, new Date().toISOString());
  // Explicit manual choices include closed/historical work; suggestions above
  // remain conservative. Saved rows are always retained independently.
  return dailyWorkLogSchema.parse({ date, canLogInternalWork: access.membership.system_role === "admin", timerSnapshot: logSnapshot.timerSnapshot, submittedAt: submission.data?.submitted_at ?? null, rows: uniqueRows.map(withStageName), additionalReviews: additionalReviews.map(withStageName), activeTasks: taskRows.map(task => withStageName({
    id: task.id, projectId: task.project_id, stage: task.stage, title: task.title, projectName: task.project.name, isParticipating: participating.has(task.id),
  })), calendar });
}

export type DailyWorkLog = NonNullable<Awaited<ReturnType<typeof getDailyWorkLog>>>;

export async function getWeeklyWorkLog(date: string, now = new Date()) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { membership } = access;
  const { studio_id: studioId, authenticatedUserId: userId } = membership;
  const client = await createClient();
  const sync = await client.rpc("sync_review_timer");
  if (sync.error) throw new Error("Unable to synchronize review time.", { cause: sync.error });
  reviewTimerSyncSchema.parse(sync.data);
  const start = startOfMondayWeek(date), through = addCalendarDays(start, 6);
  const [entries, submissions, events, eligibility] = await Promise.all([
    loadAllRows((from, to) => client.from("work_log_entries").select("internal_activity_type,activity_kind,task_id,review_round_id,minutes,work_date")
      .eq("studio_id", studioId).eq("user_id", userId).gte("work_date", start).lte("work_date", through).order("id").range(from, to)),
    client.from("work_log_days").select("work_date,submitted_at").eq("studio_id", studioId).eq("user_id", userId)
      .gte("work_date", start).lte("work_date", through),
    loadWorkLogCalendar(client, studioId),
    loadWorkLogEligibility(client, membership, start, through),
  ]);
  if (entries.error || submissions.error || events.error) throw new Error("Unable to load weekly work log.", { cause: entries.error ?? submissions.error ?? events.error });
  const calendarEvents = events.data ?? [];
  const invites = calendarEvents.flatMap(row => row.invites), participants = calendarEvents.flatMap(row => row.participants);
  const calendarMinutes = new Map(Array.from({ length: 7 }, (_, index) => {
    const day = addCalendarDays(start, index);
    return [day, getDailyCalendarContext(calendarEvents, invites, participants, userId, day, now.toISOString()).minutes];
  }));
  return buildWeeklyWorkLog(date, instantToDateOnly(now.toISOString()), entries.data ?? [], submissions.data ?? [], calendarMinutes, eligibility);
}

export async function getWorkLogReminders(now = new Date()) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { membership } = access;
  const client = await createClient();
  const today = instantToDateOnly(now.toISOString());
  const eligibility = await loadWorkLogEligibility(client, membership, null, today);
  const reminderWindow = getWorkLogReminderWindow(today, eligibility.joinedDate);
  const submissions = await loadAllRows((from, to) => client.from("work_log_days").select("work_date,submitted_at")
    .eq("studio_id", membership.studio_id).eq("user_id", membership.authenticatedUserId)
    .gte("work_date", reminderWindow.from).lt("work_date", today).order("work_date").range(from, to));
  if (submissions.error) throw new Error("Unable to load work log reminders.", { cause: submissions.error });
  return { scope: `${membership.studio_id}:${membership.authenticatedUserId}`,
    ...buildWorkLogReminders(today, submissions.data ?? [], eligibility) };
}

export async function getEmployeeWorkStatistics(studioId: string, userId: string) {
  const client = await createClient();
  const today = instantToDateOnly(new Date().toISOString());
  const [rounds, entries, sessions] = await Promise.all([
    loadAllRows((from, to) => client.from("task_review_rounds")
      .select("id,reviewer_id,result,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at),project:projects!inner(studio_id)")
      .eq("project.studio_id", studioId).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("work_log_entries").select("internal_activity_type,activity_kind,task_id,review_round_id,minutes")
      .eq("studio_id", studioId).eq("user_id", userId).lte("work_date", today).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("review_timer_sessions")
      .select("id,work_session_id,user_id,state,elapsed_us,members:review_timer_members(round_id,finished_at)")
      .eq("studio_id", studioId).eq("user_id", userId).order("id").range(from, to)),
  ]);
  if (rounds.error || entries.error || sessions.error) throw new Error("Unable to load employee work statistics.", { cause: rounds.error ?? entries.error ?? sessions.error });
  return { reviewsCompleted: completedReviewCredits(rounds.data ?? []).filter(row => row.userId === userId && instantToDateOnly(row.completedAt) <= today).length,
    reviewSessionsCompleted: completedReviewSessions(sessions.data ?? []).filter(row => instantToDateOnly(row.completedAt) <= today).length,
    ...summarizeLoggedTime(entries.data ?? []) };
}
