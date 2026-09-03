import "server-only";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectTaskById, getProjectTasks, getTaskForStatusUpdate } from "@/data/queries/tasks";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getProjectStageColumns } from "@/data/queries/project-stage-columns";
import { canCompleteAttributedTask, doesTaskCompletionRequireProductivityAttribution } from "@/lib/productivity";
import { createClient } from "@/lib/supabase/server";
import { isTaskStage } from "@/lib/task-stages";
import { canWorkOnTaskInProject } from "@/lib/project-lifecycle";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";
import { taskBulkStageAssignmentPayloadSchema, taskBulkStatusMovePayloadSchema, taskStatusUpdateSchema } from "@/lib/validation/task";
import type { TaskUpdate } from "@/types/tasks";

type AuthorizedTask = NonNullable<Awaited<ReturnType<typeof getTaskForStatusUpdate>>>;

export type TaskMutationAuthorization =
  | { success: true; task: AuthorizedTask; isStudioAdmin: boolean }
  | { success: false; formError: string };

export async function authorizeTaskMutation(taskId: string): Promise<TaskMutationAuthorization> {
  const [profile, membership] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
  ]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) {
    return { formError: "An active studio membership is required.", success: false };
  }

  let task;
  try {
    task = await getTaskForStatusUpdate(taskId);
  } catch (error) {
    console.error("Unable to verify task status authorization", error);
    return { formError: "The task could not be verified.", success: false };
  }

  if (!task) return { formError: "The task was not found or is not available.", success: false };
  if (!canWorkOnTaskInProject({ projectStatus: task.project.status, archivedAt: task.project.archived_at, stage: task.stage })) {
    return { formError: "Completed production tasks and archived project tasks are read-only.", success: false };
  }

  const isStudioAdmin = membership.system_role === "admin"
    && task.project.studio_id === membership.studio_id;
  const isAssignee = task.assignee_id === profile.id
    && task.project.studio_id === membership.studio_id;
  if (!isStudioAdmin && !isAssignee) {
    return { formError: "You can update only tasks assigned to you.", success: false };
  }

  return { isStudioAdmin, success: true, task };
}

export async function updateTaskStatusMutation(
  input: unknown,
): Promise<TaskStatusMutationResult> {
  const parsed = taskStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return { formError: "Choose a valid task status.", success: false };

  const authorization = await authorizeTaskMutation(parsed.data.task_id);
  if (!authorization.success) return authorization;

  if (parsed.data.status === "completed"
    && authorization.task.task_checklist_items.some((item) => !item.is_completed)) {
    return { formError: "Complete every checklist item before moving this task to Done.", success: false };
  }

  if (parsed.data.status === "completed" && isTaskStage(authorization.task.stage)) {
    const activeContributors = await getAssignableProjectMembers(
      authorization.task.project_id,
      authorization.task.project.studio_id,
    );
    const isActiveProjectMember = activeContributors.some((member) => member.id === authorization.task.assignee_id);
    if (!canCompleteAttributedTask({
      requiresProductivityAttribution: doesTaskCompletionRequireProductivityAttribution({
        stage: authorization.task.stage,
        completedAreaM2: authorization.task.completed_area_m2,
        projectAreaM2: authorization.task.project.total_area_m2,
      }),
      assigneeId: authorization.task.assignee_id,
      isActiveProjectMember,
    })) {
      return { formError: "Assign productivity-bearing work to an active project member before marking it complete.", success: false };
    }
  }

  const stageColumns = await getProjectStageColumns(authorization.task.project_id);
  if (!isTaskStage(authorization.task.stage) || !stageColumns[authorization.task.stage].includes(parsed.data.status)) return { success: false, formError: "Choose a status enabled for this task stage." };
  const update: Pick<TaskUpdate, "status"> = { status: parsed.data.status };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", authorization.task.id)
    .select("id, project_id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to update task status", error);
    return { formError: "The task status could not be updated. Please try again.", success: false };
  }
  revalidatePath("/leaderboard");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("status")
    .eq("id", data.project_id)
    .maybeSingle();
  if (projectError || !project) return { formError: "The task status was updated, but the project could not be refreshed. Please refresh the page.", success: false };
  const task = await getProjectTaskById(data.id);
  if (!task) return { formError: "The task status was updated, but the task could not be refreshed. Please refresh the page.", success: false };
  return { projectId: data.project_id, projectStatus: project.status, task, success: true };
}

export type BulkTaskStatusMutationResult =
  | { success: true; projectId: string; projectStatus: string; tasks: Awaited<ReturnType<typeof getProjectTasks>> }
  | { success: false; formError: string };

export async function bulkMoveTaskStatusesMutation(projectId: string, input: unknown): Promise<BulkTaskStatusMutationResult> {
  const parsed = taskBulkStatusMovePayloadSchema.safeParse(input);
  if (!parsed.success) return { formError: "Choose a valid batch and destination status.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("bulk_move_project_tasks", {
    p_project_id: projectId,
    p_source_statuses: parsed.data.source_statuses,
    p_stage: parsed.data.stage,
    p_target_status: parsed.data.target_status,
    p_task_ids: parsed.data.task_ids,
  });
  if (error) {
    console.error("Unable to bulk update task statuses", error);
    return { formError: error.message || "The task batch could not be moved. Please try again.", success: false };
  }

  const [{ data: project, error: projectError }, tasks] = await Promise.all([
    supabase.from("projects").select("status").eq("id", projectId).maybeSingle(),
    getProjectTasks(projectId),
  ]);
  if (projectError || !project) return { formError: "The task batch was moved, but the project could not be refreshed. Please refresh the page.", success: false };

  revalidatePath("/leaderboard");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  return { projectId, projectStatus: project.status, success: true, tasks };
}

export type BulkTaskStageAssignmentMutationResult =
  | { success: true; projectId: string; tasks: Awaited<ReturnType<typeof getProjectTasks>> }
  | { success: false; formError: string };

export async function bulkAssignTaskStageMutation(projectId: string, input: unknown): Promise<BulkTaskStageAssignmentMutationResult> {
  const parsed = taskBulkStageAssignmentPayloadSchema.safeParse(input);
  if (!parsed.success) return { formError: "Choose a valid stage, project member, and assignment scope.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("bulk_assign_project_stage_tasks", {
    p_assignee_id: parsed.data.assignee_id,
    p_project_id: projectId,
    p_scope: parsed.data.scope,
    p_stage: parsed.data.stage,
  });
  if (error) {
    console.error("Unable to bulk assign stage tasks", error);
    return { formError: error.message || "The task stage could not be assigned. Please try again.", success: false };
  }

  const tasks = await getProjectTasks(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  return { projectId, success: true, tasks };
}
