import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { TASK_STAGES, type TaskStage } from "@/lib/task-stages";
import { DEFAULT_STAGE_COLUMN_STATUSES, isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

export type ProjectStageColumns = Record<TaskStage, WritableTaskStatus[]>;
export type ProjectStageConfiguration = { columns: ProjectStageColumns; progressMethods: ProjectStageProgressMethods };

export async function getProjectStageConfiguration(projectId: string): Promise<ProjectStageConfiguration> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_task_stage_columns").select("stage, enabled_statuses, progress_method").eq("project_id", projectId);
  if (error) throw new Error(`Unable to load project stage configuration for ${projectId}.`, { cause: error });
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
  return { columns, progressMethods };
}

export async function getProjectStageColumns(projectId: string): Promise<ProjectStageColumns> {
  return (await getProjectStageConfiguration(projectId)).columns;
}
