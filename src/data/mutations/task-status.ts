import "server-only";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectTaskById, getTaskForStatusUpdate } from "@/data/queries/tasks";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { canCompleteAttributedTask } from "@/lib/productivity";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";
import { taskStatusUpdateSchema } from "@/lib/validation/task";
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

  if ((parsed.data.status === "review" || parsed.data.status === "completed")
    && authorization.task.task_checklist_items.some((item) => !item.is_completed)) {
    return { formError: "Complete every checklist item before moving this task to Client review or Done.", success: false };
  }

  if (parsed.data.status === "completed" && authorization.task.completed_area_m2 !== null) {
    const activeContributors = await getAssignableProjectMembers(
      authorization.task.project_id,
      authorization.task.project.studio_id,
    );
    const isActiveProjectMember = activeContributors.some((member) => member.id === authorization.task.assignee_id);
    if (!canCompleteAttributedTask({
      completedAreaM2: authorization.task.completed_area_m2,
      assigneeId: authorization.task.assignee_id,
      isActiveProjectMember,
    })) {
      return { formError: "This task has task area. Assign it to an active project member before marking it complete.", success: false };
    }
  }

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
