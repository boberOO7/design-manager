import "server-only";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectTasks } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import { isTaskStage } from "@/lib/task-stages";
import { isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

export async function updateProjectStageColumns(projectId: string, stage: string, statuses: unknown) {
  const enabledStatuses = Array.isArray(statuses)
    ? statuses.filter((status): status is WritableTaskStatus => typeof status === "string" && isWritableTaskStatus(status))
    : [];
  if (!isTaskStage(stage) || !Array.isArray(statuses) || statuses.length < 1 || statuses.length > 5 || enabledStatuses.length !== statuses.length || new Set(enabledStatuses).size !== enabledStatuses.length) {
    return { success: false as const, formError: "Choose between one and five unique task statuses." };
  }
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false as const, formError: "Only active studio administrators can configure stage columns." };
  const tasks = await getProjectTasks(projectId);
  const blocked = tasks.some((task) => task.stage === stage && isWritableTaskStatus(task.status) && !enabledStatuses.includes(task.status));
  if (blocked) return { success: false as const, formError: "Move tasks from the columns you want to disable before saving this stage." };
  const supabase = await createClient();
  const { error } = await supabase.from("project_task_stage_columns").update({ enabled_statuses: enabledStatuses }).eq("project_id", projectId).eq("stage", stage);
  if (error) return { success: false as const, formError: "The stage columns could not be saved. Please try again." };
  revalidatePath(`/projects/${projectId}`);
  return { success: true as const, enabledStatuses, stage };
}
