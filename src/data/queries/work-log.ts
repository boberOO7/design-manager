import "server-only";

import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { loadAllRows } from "@/data/queries/all-rows";
import { createClient } from "@/lib/supabase/server";
import { instantToDateOnly } from "@/lib/calendar";
import { completedReviewCredits, dailyWorkLogSchema, getDailyCalendarContext, getSuggestedTaskIds, summarizeLoggedTime, workLogDayBounds, workLogRowKey } from "@/lib/work-log";

export async function getDailyWorkLog(date: string) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { studio_id: studioId, authenticatedUserId: userId } = access.membership;
  const client = await createClient();
  const { start, end } = workLogDayBounds(date);
  const inDay = (instant: string | null) => instant !== null && Date.parse(instant) >= Date.parse(start) && Date.parse(instant) < Date.parse(end);
  const [saved, activities, tasks, rounds, events] = await Promise.all([
    loadAllRows((from, to) => client.from("work_log_entries")
      .select("activity_kind,task_id,review_round_id,minutes,task:tasks(title,project:projects(name)),round:task_review_rounds!work_log_entries_review_round_id_task_id_fkey(round_number)")
      .eq("studio_id", studioId).eq("user_id", userId).eq("work_date", date).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("project_activity").select("entity_id,actor_id,changes")
      .eq("studio_id", studioId).eq("entity_type", "task").gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false }).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("tasks")
      .select("id,title,status,assignee_id,stage,project:projects!tasks_project_id_fkey!inner(studio_id,name,status,archived_at),collaborators:task_collaborators(user_id)")
      .eq("project.studio_id", studioId).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("task_review_rounds")
      .select("id,task_id,round_number,reviewer_id,submitted_at,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at),task:tasks!inner(title,project:projects!tasks_project_id_fkey!inner(studio_id,name))")
      .eq("task.project.studio_id", studioId).lt("submitted_at", end)
      .or(`completed_at.is.null,completed_at.gte.${start}`).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("calendar_events")
      .select("id,event_type,starts_at,ends_at,all_day,project_id,organizer_id,assignee_id,cancelled_at,recurrence_rule,series_id,occurrence_start,compensates_time_off_request_id,invites:calendar_event_invites(event_id,user_id,status),participants:calendar_event_participants(event_id,user_id)")
      .eq("studio_id", studioId).order("id").range(from, to)),
  ]);
  for (const result of [saved, activities, tasks, rounds, events]) {
    if (result.error || !result.data) throw new Error("Unable to load daily work log.", { cause: result.error });
  }
  const taskRows = tasks.data ?? [], reviewRows = rounds.data ?? [];
  const participating = new Set(taskRows.filter(task => task.assignee_id === userId || task.collaborators.some(row => row.user_id === userId)).map(task => task.id));
  const activeTasks = taskRows.filter(task => task.status !== "completed" && task.status !== "cancelled"
    && !task.project.archived_at && task.project.status !== "archived"
    && (task.project.status !== "completed" || task.stage === "stage_4"));
  const relevantReviews = reviewRows.filter(round => round.reviewers.some(row => row.reviewer_id === userId
    && (round.reviewer_id === userId || inDay(row.approved_at)))
    && (inDay(round.submitted_at) || inDay(round.completed_at)
      || round.reviewers.some(row => row.reviewer_id === userId && inDay(row.approved_at))));
  const reviewTaskIds = new Set(reviewRows.filter(round => round.reviewers.some(row => row.reviewer_id === userId)).map(round => round.task_id));
  const suggestedIds = getSuggestedTaskIds(activities.data ?? [], userId, participating, reviewTaskIds,
    activeTasks.filter(task => task.status === "in_progress").map(task => task.id));
  const byTask = new Map(taskRows.map(task => [task.id, task]));
  const rows = [
    ...(saved.data ?? []).map(row => ({ activity_kind: row.activity_kind, task_id: row.task_id, review_round_id: row.review_round_id,
      minutes: row.minutes, title: row.task?.title ?? null, projectName: row.task?.project?.name ?? null, roundNumber: row.round?.round_number ?? null })),
    ...suggestedIds.flatMap(id => {
      const task = byTask.get(id);
      return task ? [{ activity_kind: "task", task_id: id, review_round_id: null, minutes: 0, title: task.title, projectName: task.project.name, roundNumber: null }] : [];
    }),
    ...relevantReviews.map(round => ({ activity_kind: "review", task_id: round.task_id, review_round_id: round.id, minutes: 0,
      title: round.task.title, projectName: round.task.project.name, roundNumber: round.round_number })),
  ];
  const rowByKey = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!rowByKey.has(workLogRowKey(row))) rowByKey.set(workLogRowKey(row), row);
  const uniqueRows = [...rowByKey.values()];
  const additionalReviews = reviewRows.filter(round => round.reviewers.some(row => row.reviewer_id === userId))
    .map(round => ({ activity_kind: "review", task_id: round.task_id, review_round_id: round.id, minutes: 0,
      title: round.task.title, projectName: round.task.project.name, roundNumber: round.round_number }));
  const calendarEvents = events.data ?? [];
  const calendar = getDailyCalendarContext(calendarEvents, calendarEvents.flatMap(row => row.invites),
    calendarEvents.flatMap(row => row.participants), userId, date, new Date().toISOString());
  return dailyWorkLogSchema.parse({ date, rows: uniqueRows, additionalReviews, activeTasks: activeTasks.map(task => ({
    id: task.id, title: task.title, projectName: task.project.name, isParticipating: participating.has(task.id),
  })), calendar });
}

export type DailyWorkLog = NonNullable<Awaited<ReturnType<typeof getDailyWorkLog>>>;

export async function getEmployeeWorkStatistics(studioId: string, userId: string) {
  const client = await createClient();
  const today = instantToDateOnly(new Date().toISOString());
  const [rounds, entries] = await Promise.all([
    loadAllRows((from, to) => client.from("task_review_rounds")
      .select("id,reviewer_id,result,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at),project:projects!inner(studio_id)")
      .eq("project.studio_id", studioId).not("completed_at", "is", null).lte("completed_at", new Date().toISOString()).order("id").range(from, to)),
    loadAllRows((from, to) => client.from("work_log_entries").select("activity_kind,task_id,review_round_id,minutes")
      .eq("studio_id", studioId).eq("user_id", userId).lte("work_date", today).order("id").range(from, to)),
  ]);
  if (rounds.error || entries.error) throw new Error("Unable to load employee work statistics.", { cause: rounds.error ?? entries.error });
  return { reviewsCompleted: completedReviewCredits(rounds.data ?? []).filter(row => row.userId === userId).length,
    ...summarizeLoggedTime(entries.data ?? []) };
}
