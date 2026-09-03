import "server-only";

import { getCurrentUserProfile } from "@/data/queries";
import { createClient } from "@/lib/supabase/server";
import { normalizeTaskCollaborators, type TaskCollaboratorRelation } from "@/lib/task-collaborators";
import { isTaskFinished, isTaskOverdue } from "@/lib/tasks";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import type { MyTask, ProjectTask } from "@/types/tasks";

const TASK_SELECT = "id, project_id, stage, title, description, status, priority, assignee_id, due_date, completed_at, completed_area_m2, manual_progress_override, production_completion, progress_weight, created_at, created_by, deadlines:task_deadlines(id, target_status, due_date, created_at, updated_at), checklist_items:task_checklist_items(id, task_id, title, is_completed, weight, position, created_at, updated_at), assignee:profiles!tasks_assignee_id_fkey(id, full_name, job_title, avatar_url), collaborators:task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey(id, full_name, job_title, avatar_url)), creator:profiles!tasks_created_by_fkey(id, full_name, job_title, avatar_url)";

type ProjectTaskRow = Omit<ProjectTask, "collaborators"> & {
  collaborators: TaskCollaboratorRelation[];
};

type MyTaskRow = Omit<MyTask, "collaborators"> & {
  collaborators: TaskCollaboratorRelation[];
};

function normalizeProjectTask({ collaborators, ...task }: ProjectTaskRow): ProjectTask {
  const deadlines = task.deadlines ?? [];
  return { ...task, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null, collaborators: normalizeTaskCollaborators(collaborators) };
}

function normalizeMyTask({ collaborators, ...task }: MyTaskRow): MyTask {
  const deadlines = task.deadlines ?? [];
  return { ...task, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null, collaborators: normalizeTaskCollaborators(collaborators) };
}

export async function getProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("position", { referencedTable: "task_checklist_items", ascending: true })
    .overrideTypes<ProjectTaskRow[], { merge: false }>();

  if (error || !data) {
    throw new Error(`Unable to load tasks for project ${projectId}.`, { cause: error });
  }

  return data.map(normalizeProjectTask);
}

export async function getProjectTaskById(taskId: string): Promise<ProjectTask | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle()
    .overrideTypes<ProjectTaskRow, { merge: false }>();

  if (error) throw new Error(`Unable to load task ${taskId}.`, { cause: error });
  return data ? normalizeProjectTask(data) : null;
}

export async function getMyTasks(): Promise<MyTask[]> {
  const profile = await getCurrentUserProfile();
  if (!profile || !profile.is_active) throw new Error("An active authenticated profile is required.");

  const supabase = await createClient();
  const { data: personalTaskIds, error: personalTaskIdsError } = await supabase.rpc("get_personal_task_ids");
  if (personalTaskIdsError || !personalTaskIds) throw new Error("Unable to load tasks assigned to the current user.", { cause: personalTaskIdsError });
  if (personalTaskIds.length === 0) return [];
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

  return data.map(normalizeMyTask).sort((left, right) => {
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
    .select("id, project_id, stage, assignee_id, status, completed_area_m2, task_checklist_items(id, is_completed), project:projects!tasks_project_id_fkey!inner(studio_id, status, archived_at, total_area_m2)")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load task ${taskId} for a status update.`, { cause: error });
  return data;
}
