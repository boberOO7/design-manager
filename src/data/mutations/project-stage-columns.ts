import "server-only";
import { z } from "zod";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectTasks } from "@/data/queries/tasks";
import { getProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { createClient } from "@/lib/supabase/server";
import { isStageProgressMethod, type StageProgressMethod } from "@/lib/project-progress";
import { isTaskStage } from "@/lib/task-stages";
import { isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";
import { validateProjectStageConfiguration } from "@/lib/project-stage-configuration";

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
  if (!isTaskStage(stage) || (!hasStatuses && !hasProgressMethod) || (hasStatuses && (!Array.isArray(statuses) || statuses.length < 1 || statuses.length > 5 || enabledStatuses.length !== statuses.length || new Set(enabledStatuses).size !== enabledStatuses.length)) || (hasProgressMethod && !isStageProgressMethod(typeof progressMethod === "string" ? progressMethod : ""))) {
    return { success: false as const, formError: "Choose between one and five unique task statuses." };
  }
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false as const, formError: "Only active studio administrators can configure stage columns." };
  const configuration = await getProjectStageConfiguration(projectId);
  const configured = configuration.stages.find((item) => item.stage === stage);
  if (!configured || (hasProgressMethod && configured.kind !== "work")) return { success: false as const, formError: "Choose a configured working stage for progress settings." };
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
    .is("deleted_at", null)
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

export async function updateProjectStageConfiguration(projectId: string, stages: unknown, includeInProductivity: unknown, showProgress: unknown, expectedVersion: unknown, deletedTaskIds: unknown) {
  const parsed = validateProjectStageConfiguration(stages);
  const deletion = z.array(z.uuid()).safeParse(deletedTaskIds);
  if (!parsed || typeof includeInProductivity !== "boolean" || typeof showProgress !== "boolean" || typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0 || !deletion.success) return { success: false as const, errorCode: "invalid_configuration", formError: "Choose valid project stages." };
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false as const, errorCode: "not_admin", formError: "Only active studio administrators can configure project stages." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project_stage_configuration", { p_project_id: projectId, p_stages: parsed.map((stage) => ({ stage: stage.stage, display_name: stage.displayName, is_enabled: stage.isEnabled, display_order: stage.displayOrder, kind: stage.kind, progress_weight: stage.progressWeight })), p_expected_version: expectedVersion, p_deleted_task_ids: deletion.data, p_include_in_productivity: includeInProductivity, p_show_progress: showProgress });
  if (error) {
    const known = ["version_conflict", "tasks_changed", "started_tasks", "logged_work", "active_tasks", "minimum_stage", "read_only"];
    const errorCode = known.find((code) => error.message.includes(`stage_${code}`)) ?? (error.code === "23503" ? "logged_work" : "save_failed");
    return { success: false as const, errorCode, formError: "The project stage configuration could not be saved. Please try again." };
  }
  revalidatePath(`/projects/${projectId}`); revalidatePath("/projects"); revalidatePath("/dashboard"); revalidatePath("/leaderboard");
  for (const path of ["/my-tasks", "/calendar", "/finance", "/statistics"]) revalidatePath(path);
  return { success: true as const };
}
