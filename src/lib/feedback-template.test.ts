import { describe, expect, it } from "vitest";
import { defaultFeedbackTemplate, feedbackTemplateSchema, type FeedbackQuestion } from "./feedback-template";

const customId = "96000000-0000-0000-0000-000000000001";
const custom: FeedbackQuestion = { id: customId, type: "choice", label: "Meeting format", visible: true, required: true, options: ["Online", "In person"] };
describe("feedback questionnaire contract", () => {
  it("preserves the original question IDs, ordering and scales", () => {
    expect(feedbackTemplateSchema.parse(defaultFeedbackTemplate).questions.map(q => [q.id, q.type])).toEqual([
      ["satisfaction", "rating"], ["communication", "rating"], ["timeliness", "rating"], ["expectations", "rating"], ["recommendation", "nps"], ["strengths", "text"], ["improvements", "text"],
    ]);
  });
  it("allows hiding and reordering standards but never removing or changing their scales", () => {
    const template = structuredClone(defaultFeedbackTemplate);
    template.questions.reverse(); template.questions[6].visible = false;
    expect(feedbackTemplateSchema.safeParse(template).success).toBe(true);
    template.questions[6].type = "text";
    expect(feedbackTemplateSchema.safeParse(template).success).toBe(false);
    template.questions.pop();
    expect(feedbackTemplateSchema.safeParse(template).success).toBe(false);
  });
  it("rejects duplicate IDs, blank custom wording and duplicate choices", () => {
    for (const question of [{ ...custom, id: "satisfaction" }, { ...custom, label: " " }, { ...custom, options: ["Online", "Online"] }]) {
      expect(feedbackTemplateSchema.safeParse({ ...defaultFeedbackTemplate, questions: [...defaultFeedbackTemplate.questions, question] }).success).toBe(false);
    }
  });
  it("rejects unsupported custom NPS, altered standard requirements and unexpected fields", () => {
    const template = structuredClone(defaultFeedbackTemplate);
    template.questions[0].required = false;
    expect(feedbackTemplateSchema.safeParse(template).success).toBe(false);
    expect(feedbackTemplateSchema.safeParse({ ...defaultFeedbackTemplate, questions: [...defaultFeedbackTemplate.questions, { ...custom, type: "nps" }] }).success).toBe(false);
    expect(feedbackTemplateSchema.safeParse({ ...defaultFeedbackTemplate, studioId: "spoof" }).success).toBe(false);
  });
});
