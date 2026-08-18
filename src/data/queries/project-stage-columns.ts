import "server-only";

import { createClient } from "@/lib/supabase/server";
import { TASK_STAGES, type TaskStage } from "@/lib/task-stages";
import { DEFAULT_STAGE_COLUMN_STATUSES, isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

export type ProjectStageColumns = Record<TaskStage, WritableTaskStatus[]>;

export async function getProjectStageColumns(projectId: string): Promise<ProjectStageColumns> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_task_stage_columns").select("stage, enabled_statuses").eq("project_id", projectId);
  if (error) throw new Error(`Unable to load project stage columns for ${projectId}.`, { cause: error });
  return TASK_STAGES.reduce<ProjectStageColumns>((columns, stage) => {
    const row = data?.find((item) => item.stage === stage);
    const enabled = row?.enabled_statuses.filter(isWritableTaskStatus) ?? [...DEFAULT_STAGE_COLUMN_STATUSES];
    columns[stage] = enabled;
    return columns;
  }, {} as ProjectStageColumns);
}
