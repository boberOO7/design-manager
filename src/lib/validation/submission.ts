import { z } from "zod";
import { SUBMISSION_PRIORITIES, SUBMISSION_STATUSES, SUBMISSION_TYPES } from "@/lib/submissions";

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const createSubmissionSchema = z.object({
  type: z.enum(SUBMISSION_TYPES),
  title: requiredText(160),
  description: requiredText(5000),
  anonymous: z.boolean(),
}).superRefine((value, context) => {
  if (value.anonymous && value.type !== "complaint") {
    context.addIssue({ code: "custom", path: ["anonymous"], message: "anonymous_complaints_only" });
  }
});

export const commentSubmissionSchema = z.object({ submissionId: z.string().uuid(), body: requiredText(3000) });

export const manageSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  status: z.enum(SUBMISSION_STATUSES),
  responsibleId: z.string().uuid().nullable(),
  priority: z.enum(SUBMISSION_PRIORITIES),
  deadline: z.iso.date().nullable(),
  internalNote: z.string().trim().max(5000),
});

export type SubmissionActionState = { success?: boolean; submissionId?: string; anonymousSubmitted?: boolean; error?: string };
