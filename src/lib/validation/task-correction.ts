import { z } from "zod";
import { taskReviewerIdsSchema } from "./task-review";
const fields = { description: z.string().trim().min(1).max(5000), assignee_id: z.uuid(), due_date: z.iso.date().nullable(), reviewer_ids: taskReviewerIdsSchema.refine(ids => ids.length > 0) };
export const taskCorrectionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }).strict(),
  z.object({ action: z.literal("update"), correction_id: z.uuid(), ...fields }).strict(),
  z.object({ action: z.literal("submit"), correction_id: z.uuid() }).strict(),
  z.object({ action: z.literal("complete"), correction_id: z.uuid() }).strict(),
  z.object({ action: z.literal("resume"), correction_id: z.uuid() }).strict(),
  z.object({ action: z.literal("cancel_completion") }).strict(),
]);
export type TaskCorrectionAction = z.infer<typeof taskCorrectionActionSchema>;
