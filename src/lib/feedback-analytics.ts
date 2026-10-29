import { z } from "zod";
import { feedbackTemplateSchema } from "./feedback-template";

export const feedbackAnalyticsSchema = z.object({
  invitations: z.number(),
  answeredInvitations: z.number(),
  summary: z.array(z.object({
    period: z.string().nullable(), responses: z.number(),
    satisfaction: z.number().nullable(), communication: z.number().nullable(),
    timeliness: z.number().nullable(), expectations: z.number().nullable(),
    recommendation: z.number().nullable(), nps: z.number().nullable(),
  })),
  additional: z.array(z.object({
    version_id: z.uuid(), version: z.number(), question: feedbackTemplateSchema.shape.questions.element,
    responses: z.number(), average: z.number().nullable(), distribution: z.record(z.string(), z.number()),
    texts: z.array(z.object({ text: z.string(), submittedAt: z.string(), projectId: z.uuid() })),
  })),
});
export type FeedbackAnalyticsData = z.infer<typeof feedbackAnalyticsSchema>;
