import { TASK_STAGES, isTaskStage, type TaskStage } from "@/lib/task-stages";

export type ProjectStageConfigurationInput = { stage: TaskStage; displayName: string; isEnabled: boolean; displayOrder: number };

export function validateProjectStageConfiguration(value: unknown): ProjectStageConfigurationInput[] | null {
  if (!Array.isArray(value) || value.length !== TASK_STAGES.length) return null;
  const stages: ProjectStageConfigurationInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.stage !== "string" || !isTaskStage(item.stage) || typeof item.displayName !== "string" || item.displayName.trim().length < 1 || item.displayName.trim().length > 80 || typeof item.isEnabled !== "boolean" || typeof item.displayOrder !== "number" || !Number.isInteger(item.displayOrder) || item.displayOrder < 1 || item.displayOrder > 4) return null;
    stages.push({ stage: item.stage, displayName: item.displayName.trim(), isEnabled: item.isEnabled, displayOrder: item.displayOrder });
  }
  return new Set(stages.map((stage) => stage.stage)).size === TASK_STAGES.length && new Set(stages.map((stage) => stage.displayOrder)).size === TASK_STAGES.length && stages.some((stage) => stage.isEnabled) ? stages : null;
}
