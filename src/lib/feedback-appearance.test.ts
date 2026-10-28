import { describe, expect, it } from "vitest";
import { feedbackBackgroundKeys, feedbackTemplateSchema, defaultFeedbackTemplate } from "./feedback-template";
import { feedbackContrast, getFeedbackAppearance } from "./feedback-appearance";

describe("questionnaire background palettes", () => {
  it("uses the standard contrast ratio", () => {
    expect(feedbackContrast("#ffffff", "#000000")).toBe(21);
    expect(feedbackContrast("#141414", "#141414")).toBe(1);
  });
  it("keeps original questionnaires valid and visually unchanged without a background property", () => {
    const template = feedbackTemplateSchema.parse(defaultFeedbackTemplate);
    expect(template.background).toBeUndefined();
    expect(getFeedbackAppearance(template.accent)).toMatchObject({ bg: "#141412", surface: "#1c1c19", text: "#f0ede5", ink: "#e3ca9c", onAccent: "#141412" });
  });
  it.each(feedbackBackgroundKeys)("accepts only the named background preset: %s", background => {
    expect(feedbackTemplateSchema.safeParse({ ...defaultFeedbackTemplate, background }).success).toBe(true);
  });
  it.each(["#ffffff", "custom", null, 1])("rejects arbitrary background values: %s", background => {
    expect(feedbackTemplateSchema.safeParse({ ...defaultFeedbackTemplate, background }).success).toBe(false);
  });
  it.each(["#66ff00", "#00bfff", "#bf32ff", "#e3ca9c", "#101010", "#ffffff"])("keeps preset text readable with accent %s", accent => {
    for (const background of ["slate", "tinted", "paper"] as const) {
      const palette = getFeedbackAppearance(accent, background);
      expect(feedbackContrast(palette.ink, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(feedbackContrast(palette.text, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(feedbackContrast(palette.muted, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(feedbackContrast(palette.onAccent, accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("tints the background with the chosen accent while fixed presets stay stable", () => {
    expect(getFeedbackAppearance("#00bfff", "tinted").bg).not.toBe(getFeedbackAppearance("#66ff00", "tinted").bg);
    expect(getFeedbackAppearance("#00bfff", "paper").bg).toBe(getFeedbackAppearance("#66ff00", "paper").bg);
  });
});
