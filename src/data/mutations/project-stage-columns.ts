import "server-only";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectTasks } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import { isStageProgressMethod, PROJECT_PROGRESS_STAGES, type StageProgressMethod } from "@/lib/project-progress";
import { isTaskStage } from "@/lib/task-stages";
import { isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

function logStageColumnsSaveError(projectId: string, stage: string, error: { code?: string; details?: string; hint?: string; message?: string } | null, missingRow = false) {
  console.error("Unable to update project stage columns", {
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    message: error?.message,
    missingRow,
    projectId,
    stage,
  });
}

export async function updateProjectStageSettings(projectId: string, stage: string, statuses: unknown, progressMethod: unknown) {
  const hasStatuses = statuses !== undefined;
  const hasProgressMethod = progressMethod !== undefined;
  const enabledStatuses = Array.isArray(statuses)
    ? statuses.filter((status): status is WritableTaskStatus => typeof status === "string" && isWritableTaskStatus(status))
    : [];
  const hasConfigurableProgress = PROJECT_PROGRESS_STAGES.includes(stage as typeof PROJECT_PROGRESS_STAGES[number]);
  if (!isTaskStage(stage) || (!hasStatuses && !hasProgressMethod) || (hasStatuses && (!Array.isArray(statuses) || statuses.length < 1 || statuses.length > 5 || enabledStatuses.length !== statuses.length || new Set(enabledStatuses).size !== enabledStatuses.length)) || (hasProgressMethod && (!hasConfigurableProgress || !isStageProgressMethod(typeof progressMethod === "string" ? progressMethod : "")))) {
    return { success: false as const, formError: "Choose between one and five unique task statuses." };
  }
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false as const, formError: "Only active studio administrators can configure stage columns." };
  const tasks = await getProjectTasks(projectId);
  const blocked = hasStatuses && tasks.some((task) => task.stage === stage && isWritableTaskStatus(task.status) && !enabledStatuses.includes(task.status));
  if (blocked) return { success: false as const, errorCode: "tasks_use_disabled_statuses", formError: "Move tasks from the columns you want to disable before saving this stage." };
  const supabase = await createClient();
  const update: { enabled_statuses?: WritableTaskStatus[]; progress_method?: StageProgressMethod } = {};
  if (hasStatuses) update.enabled_statuses = enabledStatuses;
  if (hasProgressMethod) update.progress_method = progressMethod as StageProgressMethod;
  const { data, error } = await supabase
    .from("project_task_stage_columns")
    .update(update)
    .eq("project_id", projectId)
    .eq("stage", stage)
    .select("project_id, stage, enabled_statuses, progress_method")
    .maybeSingle();
  if (error || !data) {
    logStageColumnsSaveError(projectId, stage, error, !data);
    return { success: false as const, errorCode: "save_failed", formError: "The stage columns could not be saved. Please try again." };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { success: true as const, enabledStatuses: data.enabled_statuses.filter(isWritableTaskStatus), progressMethod: data.progress_method, stage };
}
