import "server-only";

import { getCurrentUserProfile } from "@/data/queries";
import { refreshProjectTaskSchedules } from "@/data/mutations/refresh-task-schedules";
import { createClient } from "@/lib/supabase/server";
import { loadAllRows } from "./all-rows";
import { normalizeTaskCollaborators, type TaskCollaboratorRelation } from "@/lib/task-collaborators";
import { isTaskFinished, isTaskOverdue } from "@/lib/tasks";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import type { MyTask, ProjectTask, TaskSchedule, TaskStatusPeriod } from "@/types/tasks";

const TASK_SELECT = "id, project_id, checklist_template_id, stage, title, description, status, priority, assignee_id, due_date, completed_at, completed_area_m2, manual_progress_override, production_completion, progress_weight, created_at, created_by, schedule:task_schedules(expected_workdays, baseline_start, baseline_due, current_start, current_due, is_blocked, is_paused), deadlines:task_deadlines(id, target_status, due_date, created_at, updated_at), checklist_items:task_checklist_items(id, task_id, title, is_completed, is_not_needed, weight, position, created_at, updated_at), assignee:profiles!tasks_assignee_id_fkey(id, full_name, job_title, avatar_url), collaborators:task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey(id, full_name, job_title, avatar_url)), creator:profiles!tasks_created_by_fkey(id, full_name, job_title, avatar_url)";

type ProjectTaskRow = Omit<ProjectTask, "collaborators" | "currentStatusEnteredAt" | "schedule"> & {
  schedule: Omit<TaskSchedule, "predecessors"> | null;
  collaborators: TaskCollaboratorRelation[];
};

type MyTaskRow = Omit<MyTask, "collaborators" | "currentStatusEnteredAt" | "schedule"> & {
  schedule: Omit<TaskSchedule, "predecessors"> | null;
  collaborators: TaskCollaboratorRelation[];
};

type DeadlineCompletionRow = { task_id: string; target_status: string; due_date: string; completed_at: string; completed_on: string };
type CurrentStatusPeriodRow = { task_id: string; status: ProjectTask["status"]; entered_at: string };

async function attachDeadlineCompletions<T extends ProjectTask>(supabase: Awaited<ReturnType<typeof createClient>>, tasks: T[]): Promise<T[]> {
  if (!tasks.length) return tasks;
  const { data, error } = await supabase.from("task_deadline_completions")
    .select("task_id, target_status, due_date, completed_at, completed_on")
    .in("task_id", tasks.map((task) => task.id))
    .is("voided_at", null)
    .overrideTypes<DeadlineCompletionRow[], { merge: false }>();
  if (error) throw new Error("Unable to load task deadline completion history.", { cause: error });
  const completionByMilestone = new Map((data ?? []).map((completion) => [`${completion.task_id}:${completion.target_status}`, completion]));
  return tasks.map((task) => {
    const deadlines = task.deadlines?.map((deadline) => ({ ...deadline, completion: completionByMilestone.get(`${task.id}:${deadline.target_status}`) ?? null }));
    return { ...task, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null };
  });
}

async function attachCurrentStatusEnteredAt<T extends ProjectTask>(supabase: Awaited<ReturnType<typeof createClient>>, tasks: T[]): Promise<T[]> {
  if (!tasks.length) return tasks;
  const { data, error } = await supabase.from("task_status_periods")
    .select("task_id, status, entered_at")
    .in("task_id", tasks.map((task) => task.id))
    .is("exited_at", null)
    .overrideTypes<CurrentStatusPeriodRow[], { merge: false }>();
  if (error) throw new Error("Unable to load current task status timing.", { cause: error });
  const periodByTask = new Map((data ?? []).map((period) => [period.task_id, period]));
  return tasks.map((task) => {
    const period = periodByTask.get(task.id);
    return { ...task, currentStatusEnteredAt: period?.status === task.status ? period.entered_at : null };
  });
}

async function attachSchedulePredecessors<T extends ProjectTask>(supabase: Awaited<ReturnType<typeof createClient>>, tasks: T[]): Promise<T[]> {
  const scheduledIds = tasks.filter((task) => task.schedule).map((task) => task.id);
  if (!scheduledIds.length) return tasks;
  const { data: dependencies, error } = await supabase.from("task_schedule_dependencies")
    .select("task_id, predecessor_task_id").in("task_id", scheduledIds);
  if (error) throw new Error("Unable to load task schedule dependencies.", { cause: error });
  const predecessorIds = [...new Set((dependencies ?? []).map((row) => row.predecessor_task_id))];
  if (!predecessorIds.length) return tasks;
  const { data: predecessors, error: predecessorError } = await supabase.from("tasks")
    .select("id, title, status").in("id", predecessorIds);
  if (predecessorError) throw new Error("Unable to load task schedule predecessors.", { cause: predecessorError });
  const { data: handoffs, error: handoffError } = await supabase.from("task_deadline_completions")
    .select("task_id").in("task_id", predecessorIds)
    .eq("target_status", "internal_review").is("voided_at", null);
  if (handoffError) throw new Error("Unable to load task schedule handoffs.", { cause: handoffError });
  const handedOffIds = new Set((handoffs ?? []).map((row) => row.task_id));
  const predecessorById = new Map((predecessors ?? []).map((row) => [row.id, row]));
  return tasks.map((task) => !task.schedule ? task : {
    ...task,
    schedule: {
      ...task.schedule,
      predecessors: (dependencies ?? [])
        .filter((row) => row.task_id === task.id)
        .flatMap((row) => {
          const predecessor = predecessorById.get(row.predecessor_task_id);
          return predecessor ? [{ ...predecessor, scheduleCompleted: handedOffIds.has(predecessor.id) || ["completed", "cancelled"].includes(predecessor.status) }] : [];
        }),
    },
  });
}

function normalizeProjectTask({ collaborators, ...task }: ProjectTaskRow): ProjectTask {
  const deadlines = task.deadlines ?? [];
  return { ...task, schedule: task.schedule ? { ...task.schedule, predecessors: [] } : null, currentStatusEnteredAt: null, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null, collaborators: normalizeTaskCollaborators(collaborators) };
}

function normalizeMyTask({ collaborators, ...task }: MyTaskRow): MyTask {
  const deadlines = task.deadlines ?? [];
  return { ...task, schedule: task.schedule ? { ...task.schedule, predecessors: [] } : null, currentStatusEnteredAt: null, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null, collaborators: normalizeTaskCollaborators(collaborators) };
}

export async function getProjectTasks(projectId: string): Promise<ProjectTask[]> {
  await refreshProjectTaskSchedules([projectId]);
  const supabase = await createClient();
  const { data, error } = await loadAllRows((from, to) => supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id").range(from, to)
    .order("position", { referencedTable: "task_checklist_items", ascending: true })
    .overrideTypes<ProjectTaskRow[], { merge: false }>());

  if (error || !data) {
    throw new Error(`Unable to load tasks for project ${projectId}.`, { cause: error });
  }

  return attachSchedulePredecessors(supabase, await attachDeadlineCompletions(supabase, await attachCurrentStatusEnteredAt(supabase, data.map(normalizeProjectTask))));
}

export async function getProjectTaskById(taskId: string): Promise<ProjectTask | null> {
  const supabase = await createClient();
  const { data: identity, error: identityError } = await supabase.from("tasks")
    .select("project_id").eq("id", taskId).maybeSingle();
  if (identityError) throw new Error(`Unable to load task ${taskId}.`, { cause: identityError });
  if (!identity) return null;
  await refreshProjectTaskSchedules([identity.project_id]);
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle()
    .overrideTypes<ProjectTaskRow, { merge: false }>();

  if (error) throw new Error(`Unable to load task ${taskId}.`, { cause: error });
  return data ? (await attachSchedulePredecessors(supabase, await attachDeadlineCompletions(supabase, await attachCurrentStatusEnteredAt(supabase, [normalizeProjectTask(data)]))))[0] ?? null : null;
}

export async function getMyTaskStageNames(projectIds: string[]): Promise<Record<string, string>> {
  if (!projectIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_task_stage_columns")
    .select("project_id, stage, display_name")
    .in("project_id", projectIds);
  if (error) throw new Error("Unable to load personal task stage names.", { cause: error });
  const names: Record<string, string> = {};
  for (const row of data ?? []) if (row.display_name) names[`${row.project_id}:${row.stage}`] = row.display_name;
  return names;
}

export async function getMyTasks(): Promise<MyTask[]> {
  const profile = await getCurrentUserProfile();
  if (!profile || !profile.is_active) throw new Error("An active authenticated profile is required.");

  const supabase = await createClient();
  const { data: personalTaskIds, error: personalTaskIdsError } = await supabase.rpc("get_personal_task_ids");
  if (personalTaskIdsError || !personalTaskIds) throw new Error("Unable to load tasks assigned to the current user.", { cause: personalTaskIdsError });
  if (personalTaskIds.length === 0) return [];
  const { data: projectRows, error: projectError } = await supabase.from("tasks")
    .select("project_id").in("id", personalTaskIds.map((row) => row.task_id));
  if (projectError) throw new Error("Unable to load personal task projects.", { cause: projectError });
  await refreshProjectTaskSchedules([...new Set((projectRows ?? []).map((row) => row.project_id))]);
  const { data, error } = await supabase
    .from("tasks")
    .select(`${TASK_SELECT}, project:projects!tasks_project_id_fkey!inner(id, name, status, archived_at)`)
    .in("id", personalTaskIds.map((row) => row.task_id))
    .neq("project.status", "paused")
    .is("project.archived_at", null)
    .overrideTypes<MyTaskRow[], { merge: false }>();

  if (error || !data) {
    throw new Error("Unable to load tasks assigned to the current user.", { cause: error });
  }

  return (await attachSchedulePredecessors(supabase, await attachDeadlineCompletions(supabase, data.map(normalizeMyTask)))).sort((left, right) => {
    const leftRank = isTaskFinished(left.status) ? 2 : isTaskOverdue(left) ? 0 : 1;
    const rightRank = isTaskFinished(right.status) ? 2 : isTaskOverdue(right) ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.due_date !== right.due_date) {
      if (!left.due_date) return 1;
      if (!right.due_date) return -1;
      return left.due_date.localeCompare(right.due_date);
    }
    return left.created_at.localeCompare(right.created_at);
  });
}

export async function getTaskForStatusUpdate(taskId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, project_id, stage, assignee_id, status, completed_area_m2, task_checklist_items(id, is_completed, is_not_needed), project:projects!tasks_project_id_fkey!inner(studio_id, status, archived_at, total_area_m2)")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load task ${taskId} for a status update.`, { cause: error });
  return data;
}

export async function getTaskStatusHistory(taskId: string): Promise<TaskStatusPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_status_periods")
    .select("id, studio_id, project_id, task_id, status, entered_at, exited_at")
    .eq("task_id", taskId)
    .order("entered_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`Unable to load status history for task ${taskId}.`, { cause: error });
  return data ?? [];
}

export async function getTaskCurrentStatusEnteredAt(taskId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_status_periods")
    .select("entered_at")
    .eq("task_id", taskId)
    .is("exited_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load the current status start for task ${taskId}.`, { cause: error });
  return data?.entered_at ?? null;
}
