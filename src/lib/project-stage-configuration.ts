import { z } from "zod";
import { taskStageSchema } from "@/lib/task-stages";

export const projectStageInputSchema = z.object({
  stage: taskStageSchema,
  displayName: z.string().trim().min(1).max(80),
  isEnabled: z.boolean(),
  displayOrder: z.number().int().positive(),
  kind: z.enum(["work", "additional"]),
  progressWeight: z.number().int().positive(),
});
export type ProjectStageConfigurationInput = z.infer<typeof projectStageInputSchema>;
export const stageDeletionInfoSchema = z.array(z.object({ stage: taskStageSchema, taskIds: z.array(z.uuid()), blockReason: z.enum(["started_tasks", "logged_work"]).nullable() }));
export type StageDeletionInfo = z.infer<typeof stageDeletionInfoSchema>;

export function moveProjectStage(stages: ProjectStageConfigurationInput[], sourceId: string, targetId: string): ProjectStageConfigurationInput[] {
  const sourceIndex = stages.findIndex((stage) => stage.stage === sourceId);
  const targetIndex = stages.findIndex((stage) => stage.stage === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return stages;
  const next = [...stages];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next.map((stage, index) => ({ ...stage, displayOrder: index + 1 }));
}

export function validateProjectStageConfiguration(value: unknown): ProjectStageConfigurationInput[] | null {
  const parsed = z.array(projectStageInputSchema).min(1).safeParse(value);
  if (!parsed.success) return null;
  const stages = parsed.data;
  return new Set(stages.map((stage) => stage.stage)).size === stages.length
    && new Set(stages.map((stage) => stage.displayOrder)).size === stages.length
    && stages.every((stage) => stage.displayOrder <= stages.length)
    && stages.some((stage) => stage.isEnabled) ? stages : null;
}
