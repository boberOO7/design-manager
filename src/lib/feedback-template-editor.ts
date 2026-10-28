import { isBuiltinQuestion, type FeedbackBuiltinKey, type FeedbackTemplate } from "./feedback-template";

type EditorDefaults = Pick<FeedbackTemplate, "title" | "subtitle" | "thankYou"> & {
  questions: Record<FeedbackBuiltinKey, string>;
};

export function createFeedbackEditorDraft(template: FeedbackTemplate, defaults: EditorDefaults): FeedbackTemplate {
  return {
    ...template,
    title: template.title || defaults.title,
    subtitle: template.subtitle || defaults.subtitle,
    thankYou: template.thankYou || defaults.thankYou,
    questions: template.questions.map(q => ({ ...q, label: q.label || (isBuiltinQuestion(q.id) ? defaults.questions[q.id] : "") })),
  };
}

export function serializeFeedbackEditorDraft(draft: FeedbackTemplate, saved: { draft: FeedbackTemplate; source: FeedbackTemplate }): FeedbackTemplate {
  // Display defaults as editable text without freezing untouched translations
  // into invitations when the admin changes an unrelated setting.
  return {
    ...draft,
    title: draft.title === saved.draft.title ? saved.source.title : draft.title,
    subtitle: draft.subtitle === saved.draft.subtitle ? saved.source.subtitle : draft.subtitle,
    thankYou: draft.thankYou === saved.draft.thankYou ? saved.source.thankYou : draft.thankYou,
    questions: draft.questions.map(q => {
      const previous = saved.draft.questions.find(item => item.id === q.id);
      const source = saved.source.questions.find(item => item.id === q.id);
      return { ...q, label: previous && source && q.label === previous.label ? source.label : q.label };
    }),
  };
}
