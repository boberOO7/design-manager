import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { TASK_STAGES, type TaskStage } from "@/lib/task-stages";
import { DEFAULT_STAGE_COLUMN_STATUSES, isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

export type ProjectStageColumns = Record<TaskStage, WritableTaskStatus[]>;
export type ConfiguredProjectStage = { stage: TaskStage; displayName: string | null; isEnabled: boolean; displayOrder: number };
export type ProjectStageConfiguration = { columns: ProjectStageColumns; progressMethods: ProjectStageProgressMethods; stages: ConfiguredProjectStage[]; includeInProductivity: boolean };

export async function getProjectStageConfiguration(projectId: string): Promise<ProjectStageConfiguration> {
  const supabase = await createClient();
  const [{ data, error }, { data: project, error: projectError }] = await Promise.all([
    supabase.from("project_task_stage_columns").select("stage, enabled_statuses, progress_method, display_name, is_enabled, display_order").eq("project_id", projectId),
    supabase.from("projects").select("include_in_productivity").eq("id", projectId).maybeSingle(),
  ]);
  if (error) throw new Error(`Unable to load project stage configuration for ${projectId}.`, { cause: error });
  if (projectError) throw new Error(`Unable to load productivity configuration for ${projectId}.`, { cause: projectError });
  const columns = TASK_STAGES.reduce<ProjectStageColumns>((result, stage) => {
    const row = data?.find((item) => item.stage === stage);
    const enabled = row?.enabled_statuses.filter(isWritableTaskStatus) ?? [...DEFAULT_STAGE_COLUMN_STATUSES];
    result[stage] = enabled;
    return result;
  }, {} as ProjectStageColumns);
  const progressMethods = PROJECT_PROGRESS_STAGES.reduce<ProjectStageProgressMethods>((result, stage) => {
    const row = data?.find((item) => item.stage === stage);
    result[stage] = row && isStageProgressMethod(row.progress_method) ? row.progress_method : DEFAULT_PROJECT_STAGE_PROGRESS_METHODS[stage];
    return result;
  }, {} as ProjectStageProgressMethods);
  const stages = TASK_STAGES.map((stage) => {
    const row = data?.find((item) => item.stage === stage);
    return { stage, displayName: row?.display_name ?? null, isEnabled: row?.is_enabled ?? true, displayOrder: row?.display_order ?? TASK_STAGES.indexOf(stage) + 1 };
  }).sort((left, right) => left.displayOrder - right.displayOrder);
  return { columns, progressMethods, stages, includeInProductivity: project?.include_in_productivity ?? true };
}

export async function getProjectStageColumns(projectId: string): Promise<ProjectStageColumns> {
  return (await getProjectStageConfiguration(projectId)).columns;
}
