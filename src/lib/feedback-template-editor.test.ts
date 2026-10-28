import { describe, expect, it } from "vitest";
import { defaultFeedbackTemplate } from "./feedback-template";
import { createFeedbackEditorDraft, serializeFeedbackEditorDraft } from "./feedback-template-editor";
import en from "../../messages/en.json";

const defaults = { title: en.Feedback.introTitle, subtitle: en.Feedback.introDescription, thankYou: en.Feedback.thankYouDescription, questions: en.Feedback.questions };

describe("feedback editor text", () => {
  it("shows actual default copy but leaves the optional introduction empty", () => {
    const draft = createFeedbackEditorDraft(defaultFeedbackTemplate, defaults);
    expect(draft.title).toBe(defaults.title);
    expect(draft.subtitle).toBe(defaults.subtitle);
    expect(draft.thankYou).toBe(defaults.thankYou);
    expect(draft.introduction).toBe("");
    expect(draft.questions[0].label).toBe(defaults.questions.satisfaction);
    expect(defaultFeedbackTemplate.title).toBe("");
  });
  it("preserves locale defaults when editing only appearance, order or visibility", () => {
    const draft = createFeedbackEditorDraft(defaultFeedbackTemplate, defaults);
    const edited = { ...draft, accent: "#00bfff", questions: draft.questions.toReversed().map(q => ({ ...q, visible: false })) };
    const result = serializeFeedbackEditorDraft(edited, { source: defaultFeedbackTemplate, draft });
    expect(result.title).toBe("");
    expect(result.subtitle).toBe("");
    expect(result.thankYou).toBe("");
    expect(result.questions.every(q => q.label === "")).toBe(true);
    expect(result.accent).toBe("#00bfff");
    expect(result.questions[0].id).toBe("improvements");
  });
  it("keeps cleared text empty and preserves explicitly saved copy even if it matches a translation", () => {
    const source = { ...defaultFeedbackTemplate, title: defaults.title, introduction: "Welcome", subtitle: "Custom subtitle", thankYou: "Custom thanks" };
    const draft = createFeedbackEditorDraft(source, defaults);
    expect(serializeFeedbackEditorDraft(draft, { source, draft }).title).toBe(defaults.title);
    const cleared = { ...draft, title: "", subtitle: "", introduction: "", thankYou: "", questions: draft.questions.map(q => ({ ...q, label: "" })) };
    expect(serializeFeedbackEditorDraft(cleared, { source, draft })).toEqual(defaultFeedbackTemplate);
  });
});
