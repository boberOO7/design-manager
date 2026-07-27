import "server-only";

import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getTaskForStatusUpdate } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";
import { taskStatusUpdateSchema } from "@/lib/validation/task";
import type { TaskUpdate } from "@/types/tasks";

export async function updateTaskStatusMutation(
  input: unknown,
): Promise<TaskStatusMutationResult> {
  const parsed = taskStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return { formError: "Choose a valid task status.", success: false };

  const [profile, membership] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
  ]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) {
    return { formError: "An active studio membership is required.", success: false };
  }

  let task;
  try {
    task = await getTaskForStatusUpdate(parsed.data.task_id);
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

  const update: Pick<TaskUpdate, "status"> = { status: parsed.data.status };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .select("id, project_id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to update task status", error);
    return { formError: "The task status could not be updated. Please try again.", success: false };
  }

  return { projectId: data.project_id, success: true };
}
