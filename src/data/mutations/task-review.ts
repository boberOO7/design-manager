import "server-only";

import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectTaskById, getProjectTasks } from "@/data/queries/tasks";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { taskBulkReviewPayloadSchema, taskReviewActionSchema } from "@/lib/validation/task-review";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";

export async function bulkUpdateTaskReviewMutation(projectId: string, input: unknown) {
  const parsed = taskBulkReviewPayloadSchema.safeParse(input);
  if (!z.uuid().safeParse(projectId).success || !parsed.success) return { success: false, formError: "Choose a valid task batch and reviewer sequence." } as const;
  if (!await getActiveStudioAdmin()) return { success: false, formError: "Only active studio administrators can configure task review." } as const;
  const supabase = await createClient();
  const { error } = await supabase.rpc("bulk_configure_task_review", {
    p_project_id: projectId, p_stage: parsed.data.stage, p_task_ids: parsed.data.task_ids, p_reviewer_ids: parsed.data.reviewer_ids,
  });
  if (error) return { success: false, formError: error.message } as const;
  const tasks = await getProjectTasks(projectId);
  for (const path of [`/projects/${projectId}`, "/projects", "/my-tasks", "/dashboard"]) revalidatePath(path);
  return { success: true, tasks } as const;
}

export async function updateTaskReviewMutation(taskId: string, input: unknown): Promise<TaskStatusMutationResult> {
  const parsed = taskReviewActionSchema.safeParse(input);
  if (!z.uuid().safeParse(taskId).success || !parsed.success) return { success: false, formError: "Choose a valid review action and describe any required fixes." };
  const resolution = await resolveActiveStudioMembership();
  if (resolution.status !== "ACTIVE_STUDIO") return { success: false, formError: "An active studio membership is required." };
  const action = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_review", {
    p_task_id: taskId, p_action: action.action,
    ...(action.action === "configure" ? { p_requires_review: action.requires_review, p_reviewer_id: action.reviewer_id ?? undefined } : {}),
    ...(action.action === "approved" || action.action === "rework" ? { p_round_id: action.round_id, p_expected_reviewer_id: action.reviewer_id } : {}),
    ...(action.action === "rework" ? { p_comment: action.comment } : {}),
  });
  if (error) return { success: false, formError: error.message };
  if (action.action === "approved" || action.action === "rework") scheduleAutomaticLabor(resolution.membership.studio_id);
  const task = await getProjectTaskById(taskId);
  if (!task) return { success: false, formError: "The review was saved. Please refresh the task." };
  const { data: project, error: projectError } = await supabase.from("projects").select("status").eq("id", task.project_id).single();
  if (projectError) return { success: false, formError: "The review was saved. Please refresh the project." };
  for (const path of [`/projects/${task.project_id}`, "/projects", "/my-tasks", "/dashboard", "/leaderboard", "/calendar"]) revalidatePath(path);
  return { success: true, task, projectId: task.project_id, projectStatus: project.status };
}
