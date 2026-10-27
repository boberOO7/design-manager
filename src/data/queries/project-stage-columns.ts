import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStageProgressMethod, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { isTaskStage, type ProjectStageDefinition } from "@/lib/task-stages";
import { isWritableTaskStatus, type WritableTaskStatus } from "@/lib/tasks";

export type ProjectStageColumns = Record<string, WritableTaskStatus[]>;
export type ConfiguredProjectStage = ProjectStageDefinition & { displayName: string | null; isEnabled: boolean; displayOrder: number };
export type StageSchedulePause = { startedOn: string; reason: string | null } | null;
export type ProjectStageConfiguration = { columns: ProjectStageColumns; progressMethods: ProjectStageProgressMethods; schedulePause: Record<string, StageSchedulePause>; stages: ConfiguredProjectStage[]; includeInProductivity: boolean; showProgress: boolean; version: number };

export async function getProjectStageConfiguration(projectId: string): Promise<ProjectStageConfiguration> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_stage_configuration", { p_project_id: projectId });
  const snapshot = z.object({ version: z.number().int(), includeInProductivity: z.boolean(), showProgress: z.boolean(), rows: z.array(z.object({
    stage: z.string(), display_name: z.string().nullable(), is_enabled: z.boolean(), display_order: z.number().int(), kind: z.enum(["work", "additional"]), progress_weight: z.number().int().positive(),
    enabled_statuses: z.array(z.string()), progress_method: z.string(), schedule_paused_on: z.string().nullable(), schedule_pause_reason: z.string().nullable(),
  })) }).safeParse(data);
  if (error || !snapshot.success) throw new Error(`Unable to load project stage configuration for ${projectId}.`, { cause: error });
  const columns: ProjectStageColumns = {};
  const progressMethods: ProjectStageProgressMethods = {};
  const schedulePause: Record<string, StageSchedulePause> = {};
  const stages: ConfiguredProjectStage[] = [];
  for (const row of snapshot.data.rows) {
    if (!isTaskStage(row.stage)) throw new Error("Unsupported project stage configuration.");
    columns[row.stage] = row.enabled_statuses.filter(isWritableTaskStatus);
    progressMethods[row.stage] = isStageProgressMethod(row.progress_method) ? row.progress_method : "equal";
    schedulePause[row.stage] = row.schedule_paused_on ? { startedOn: row.schedule_paused_on, reason: row.schedule_pause_reason } : null;
    stages.push({ stage: row.stage, displayName: row.display_name, isEnabled: row.is_enabled, displayOrder: row.display_order, kind: row.kind, progressWeight: row.progress_weight });
  }
  return { columns, progressMethods, schedulePause, stages, includeInProductivity: snapshot.data.includeInProductivity, showProgress: snapshot.data.showProgress, version: snapshot.data.version };
}

export async function getProjectStageColumns(projectId: string): Promise<ProjectStageColumns> {
  return (await getProjectStageConfiguration(projectId)).columns;
}

export async function getProjectTaskStage(projectId: string, stage: string) {
  const configuration = await getProjectStageConfiguration(projectId);
  return configuration.stages.find((item) => item.stage === stage);
}
