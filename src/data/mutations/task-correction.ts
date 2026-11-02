import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectTaskById } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import { taskCorrectionActionSchema } from "@/lib/validation/task-correction";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";

export async function updateTaskCorrectionMutation(taskId: string, input: unknown): Promise<TaskStatusMutationResult> {
  const parsed = taskCorrectionActionSchema.safeParse(input);
  if (!z.uuid().safeParse(taskId).success || !parsed.success) return { success: false, formError: "Choose a valid correction action." };
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return { success: false, formError: "An active studio membership is required." };
  const action = parsed.data;
  const client = await createClient();
  const { error } = await client.rpc("update_task_correction", { p_task_id: taskId, p_action: action.action,
    ...("correction_id" in action ? { p_correction_id: action.correction_id } : {}),
    ...("description" in action ? { p_description: action.description, p_assignee_id: action.assignee_id, p_due_date: action.due_date ?? undefined, p_reviewer_ids: action.reviewer_ids } : {}),
  });
  if (error) return { success: false, formError: error.message };
  const task = await getProjectTaskById(taskId);
  if (!task) return { success: false, formError: "Please refresh the task." };
  const { data: project, error: projectError } = await client.from("projects").select("status").eq("id", task.project_id).single();
  if (projectError) return { success: false, formError: "Please refresh the project." };
  for (const path of [`/projects/${task.project_id}`, "/my-tasks", "/dashboard", "/projects", "/leaderboard"]) revalidatePath(path);
  return { success: true, task, projectId: task.project_id, projectStatus: project.status };
}
