import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import uk from "../../../messages/uk.json";
import en from "../../../messages/en.json";
import { ClientSurvey } from "./client-survey";

let copy = uk.Feedback;
vi.mock("next-intl", async importOriginal => ({
  ...await importOriginal<typeof import("next-intl")>(),
  useTranslations: () => createTranslator({ locale: "uk", messages: { Feedback: copy }, namespace: "Feedback", onError: error => { throw error; } }),
}));
beforeEach(() => { copy = uk.Feedback; });

it.each([uk.Feedback, en.Feedback])("renders current survey copy without formatting errors", messages => {
  copy = messages;
  expect(renderToStaticMarkup(<ClientSurvey token={"a".repeat(64)} studioName="SPACE" initialState="ready" />)).toContain(messages.introDescription);
});
it("remains compatible with an already-loaded message containing the studio placeholder", () => {
  copy = { ...uk.Feedback, introDescription: "Дякуємо, що обрали {studio}." };
  const html = renderToStaticMarkup(<ClientSurvey token={"a".repeat(64)} studioName="SPACE" initialState="ready" />);
  expect(html).toContain("Дякуємо, що обрали SPACE.");
});

it.each(["#00bfff", "#bf32ff", "#172038"])("provides a complete custom palette and readable button text for %s", async accent => {
  const { defaultFeedbackTemplate } = await import("@/lib/feedback-template");
  const html = renderToStaticMarkup(<ClientSurvey token="" initialState="ready" template={{ ...defaultFeedbackTemplate, accent }} />);
  expect(html).toContain('data-custom-accent="true"');
  expect(html).toContain(`--survey-accent:${accent}`);
  expect(html).toContain(`--survey-on-accent:${accent === "#172038" ? "#ffffff" : "#141414"}`);
});

it("shows an introduction only when supplied and keeps thanks out of the questionnaire", async () => {
  const { defaultFeedbackTemplate } = await import("@/lib/feedback-template");
  const template = { ...defaultFeedbackTemplate, introduction: "A real welcome message", thankYou: "A real thank-you message" };
  const ready = renderToStaticMarkup(<ClientSurvey token="" initialState="ready" template={template} />);
  expect(ready).toContain(template.introduction);
  expect(ready).not.toContain(template.thankYou);
  expect(renderToStaticMarkup(<ClientSurvey token="" initialState="ready" template={{ ...template, introduction: "" }} />)).not.toContain(template.introduction);
});
