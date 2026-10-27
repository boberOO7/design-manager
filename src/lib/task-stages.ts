import { z } from "zod";

export const TASK_STAGES = ["stage_1", "stage_2", "stage_3", "stage_4"] as const;

export type TaskStage = (typeof TASK_STAGES)[number] | `custom_${string}`;
export type ProjectStageDefinition = { stage: TaskStage; kind: "work" | "additional"; progressWeight: number };

export const DEFAULT_PROJECT_STAGES: ProjectStageDefinition[] = TASK_STAGES.map((stage, index) => ({ stage, kind: stage === "stage_4" ? "additional" : "work", progressWeight: index === 1 || index === 2 ? 2 : 1 }));

export function isTaskStage(value: string): value is TaskStage {
  return TASK_STAGES.some((stage) => stage === value) || /^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export const taskStageSchema = z.custom<TaskStage>((value) => typeof value === "string" && isTaskStage(value), "Choose a valid project stage.");

export function getStageLabel(stage: string, translate: (key: string) => string, displayName?: string | null): string {
  return displayName ?? (stage.startsWith("custom_") ? stage : translate(stage));
}
