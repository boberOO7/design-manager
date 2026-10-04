import { z } from "zod";
import { projectPlanSchema } from "./finance-project-plan";

export const projectOrderInputSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(),
  intent: z.enum(["create", "saveDraft", "rename", "confirm", "discard"]),
  orderId: z.uuid().optional(), version: z.coerce.number().int().nonnegative().optional(),
  name: z.string().trim().min(1).max(2000).optional(), plan: z.unknown().optional(),
}).refine(value => value.intent === "create" ? Boolean(value.name) : Boolean(value.orderId) && value.version !== undefined)
  .refine(value => value.intent !== "rename" || Boolean(value.name));

// A draft uses the existing plan contract; its rows are not allocation targets.
export function parseProjectOrderDraft(value: unknown, projectId: string, orderId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = projectPlanSchema.safeParse({ ...value, projectId, orderId, requestId: orderId });
  return parsed.success ? parsed.data : null;
}
