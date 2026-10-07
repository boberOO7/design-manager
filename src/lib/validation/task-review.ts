import { z } from "zod";
import { TASK_STAGES } from "@/lib/task-stages";

export const taskReviewCandidatesSchema = z.object({ reviewers: z.array(z.object({ id: z.uuid(), full_name: z.string(), avatar_url: z.string().nullable().optional() })) });
export const taskReviewerIdsSchema = z.array(z.uuid("Choose valid reviewers")).refine((ids) => new Set(ids).size === ids.length, "Choose unique reviewers");
export const taskBulkReviewPayloadSchema = z.object({
  stage: z.enum(TASK_STAGES),
  task_ids: z.array(z.uuid("Choose valid tasks")).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, "Choose unique tasks"),
  reviewer_ids: taskReviewerIdsSchema,
}).strict();

export const taskReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), requires_review: z.boolean(), reviewer_id: z.uuid().nullable() }).strict()
    .refine((value) => !value.requires_review || value.reviewer_id !== null, { message: "Choose a reviewer", path: ["reviewer_id"] }),
  z.object({ action: z.literal("submit") }).strict(),
  z.object({ action: z.literal("approved"), round_id: z.uuid(), reviewer_id: z.uuid().optional() }).strict(),
  z.object({ action: z.literal("rework"), round_id: z.uuid(), reviewer_id: z.uuid().optional(), comment: z.string().trim().min(1).max(5000) }).strict(),
]);
export type TaskReviewAction = z.infer<typeof taskReviewActionSchema>;
