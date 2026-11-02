import { z } from "zod";
import type { Database } from "@/types/database.types";
import { templateStageProgressMethodsSchema } from "@/lib/project-templates";
import type { TaskStage } from "@/lib/task-stages";
import { areaComponentsSchema } from "./work-direction-components";

export const productivityRoleSchema = z.enum(["initial", "visualization", "final", "none"]);
export type ProductivityRole = z.infer<typeof productivityRoleSchema>;
export type ProjectWorkDirection = Database["public"]["Tables"]["project_work_directions"]["Row"];
export const directionKindSchema = z.enum(["interior", "facade", "landscape", "architecture", "exterior", "custom"]);
export type DirectionKind = z.infer<typeof directionKindSchema>;
export const directionStatusSchema = z.enum(["planned", "active", "paused", "completed"]);
export type DirectionStatus = z.infer<typeof directionStatusSchema>;
export type DirectionPreset = Database["public"]["Tables"]["studio_direction_presets"]["Row"];

export const directionPresetInputSchema = z.object({
  kind: directionKindSchema,
  coefficient: z.number().finite().positive(),
  recommendedMin: z.number().finite().positive().nullable(),
  recommendedMax: z.number().finite().positive().nullable(),
  templateId: z.uuid().nullable(),
  stageProgressMethods: templateStageProgressMethodsSchema.optional(),
  version: z.number().int().nonnegative(),
}).refine(value => (value.recommendedMin === null && value.recommendedMax === null)
  || (value.recommendedMin !== null && value.recommendedMax !== null && value.recommendedMin < value.recommendedMax));

export function directionName(direction: Pick<ProjectWorkDirection, "name" | "kind">, labels: (key: string) => string) {
  return direction.name ?? labels(direction.kind ? `kinds.${direction.kind}` : "defaultName");
}

export const workDirectionInputSchema = z.object({
  intent: z.enum(["save", "remove", "up", "down"]),
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  areaM2: z.number().finite().positive().optional(),
  coefficient: z.number().finite().positive().optional(),
  areaComponents: areaComponentsSchema.nullable().optional(),
  startDate: z.union([z.iso.date(), z.literal("")]).optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  templateId: z.union([z.uuid(), z.literal("")]).optional(),
  kind: directionKindSchema.nullable().optional(),
  useDefaultName: z.boolean().optional(),
}).refine(input => input.intent === "save"
  ? input.name !== undefined && input.areaM2 !== undefined && input.coefficient !== undefined
  : input.id !== undefined)
  .refine(input => !input.startDate || !input.dueDate || input.startDate <= input.dueDate);

export function getStageProductivityRole(stage: TaskStage, role?: ProductivityRole): ProductivityRole {
  return role ?? (stage === "stage_1" ? "initial" : stage === "stage_2" ? "visualization" : stage === "stage_3" ? "final" : "none");
}

export function equivalentArea(area: number, coefficient: number): number | null {
  const result = area * coefficient;
  return Number.isFinite(area) && area > 0 && Number.isFinite(coefficient) && coefficient > 0 && Number.isFinite(result) ? result : null;
}
