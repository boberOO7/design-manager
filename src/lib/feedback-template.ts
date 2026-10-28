import { z } from "zod";
import { feedbackRatingKeys } from "./feedback";

export const feedbackBackgroundKeys = ["original", "slate", "tinted", "paper"] as const;

export const feedbackBuiltinKeys = [...feedbackRatingKeys, "strengths", "improvements"] as const;
export type FeedbackBuiltinKey = typeof feedbackBuiltinKeys[number];
export function isBuiltinQuestion(id: string): id is FeedbackBuiltinKey {
  return feedbackBuiltinKeys.some(key => key === id);
}
const questionSchema = z.strictObject({
  id: z.string().refine(id => isBuiltinQuestion(id) || z.uuid().safeParse(id).success),
  type: z.enum(["rating", "nps", "text", "choice"]),
  label: z.string().trim().max(500),
  visible: z.boolean(),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)),
}).superRefine((q, ctx) => {
  const builtin = isBuiltinQuestion(q.id);
  const expected = q.id === "recommendation" ? "nps" : q.id === "strengths" || q.id === "improvements" ? "text" : "rating";
  if (builtin && (q.type !== expected || q.required !== feedbackRatingKeys.some(key => key === q.id))) ctx.addIssue({ code: "custom", message: "Standard scales and requirements are fixed" });
  if (!builtin && (!q.label || q.type === "nps")) ctx.addIssue({ code: "custom", message: "Custom question needs a label and supported type" });
  if (q.type === "choice" ? q.options.length < 2 || new Set(q.options).size !== q.options.length : q.options.length !== 0) ctx.addIssue({ code: "custom", message: "Provide at least two unique choices" });
});
export const feedbackTemplateSchema = z.strictObject({
  title: z.string().trim().max(200), subtitle: z.string().trim().max(1000),
  introduction: z.string().trim().max(2000), thankYou: z.string().trim().max(2000),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.enum(feedbackBackgroundKeys).optional(),
  questions: z.array(questionSchema),
}).superRefine((value, ctx) => {
  const ids = value.questions.map(q => q.id);
  if (new Set(ids).size !== ids.length || feedbackBuiltinKeys.some(id => !ids.includes(id))) ctx.addIssue({ code: "custom", message: "Keep each standard question exactly once" });
});
export type FeedbackTemplate = z.infer<typeof feedbackTemplateSchema>;
export type FeedbackQuestion = FeedbackTemplate["questions"][number];
export const defaultFeedbackTemplate: FeedbackTemplate = {
  title: "", subtitle: "", introduction: "", thankYou: "", accent: "#e3ca9c",
  questions: feedbackBuiltinKeys.map(id => ({ id, type: id === "recommendation" ? "nps" : id === "strengths" || id === "improvements" ? "text" : "rating", label: "", visible: true, required: feedbackRatingKeys.some(key => key === id), options: [] })),
};
export const feedbackAnswersSchema = z.record(z.string(), z.union([z.string().trim().max(2000), z.number().int(), z.null()]));
export type FeedbackAnswers = z.infer<typeof feedbackAnswersSchema>;
