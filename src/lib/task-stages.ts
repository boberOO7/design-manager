export const TASK_STAGES = ["stage_1", "stage_2", "stage_3", "stage_4"] as const;

export type TaskStage = (typeof TASK_STAGES)[number];

export function isTaskStage(value: string): value is TaskStage {
  return TASK_STAGES.includes(value as TaskStage);
}
