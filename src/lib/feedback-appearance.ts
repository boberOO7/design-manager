import type { FeedbackTemplate } from "./feedback-template";

export type FeedbackBackground = NonNullable<FeedbackTemplate["background"]>;

function channels(hex: string) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); }
function mix(from: string, to: string, amount: number) {
  const target = channels(to);
  return "#" + channels(from).map((value, index) => Math.round(value + (target[index] - value) * amount).toString(16).padStart(2, "0")).join("");
}
function luminance(hex: string) {
  return channels(hex).reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    return sum + linear * [.2126, .7152, .0722][index];
  }, 0);
}
export function feedbackContrast(foreground: string, background: string) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
function readableAccent(accent: string, background: string) {
  if (feedbackContrast(accent, background) >= 4.5) return accent;
  const target = feedbackContrast("#ffffff", background) > feedbackContrast("#141414", background) ? "#ffffff" : "#141414";
  let low = 0, high = 1;
  // Find the smallest tint/shade that meets WCAG AA for the questionnaire's small text.
  for (let index = 0; index < 10; index++) {
    const middle = (low + high) / 2;
    if (feedbackContrast(mix(accent, target, middle), background) >= 4.5) high = middle;
    else low = middle;
  }
  return mix(accent, target, high);
}

export function getFeedbackAppearance(accent: string, background: FeedbackBackground = "original") {
  const customAccent = accent.toLowerCase() !== "#e3ca9c";
  const original = customAccent
    ? { bg: "#141414", surface: "#1c1c1c", text: "#eeeeee", muted: "#afafaf", line: "#3b3b3b", rule: "#777777", tick: "#777777", number: "#d3d3d3" }
    : { bg: "#141412", surface: "#1c1c19", text: "#f0ede5", muted: "#afaca2", line: "#3b3a32", rule: "#777165", tick: "#777164", number: "#d3ccbe" };
  const palette = background === "paper"
    ? { bg: "#f4f1eb", surface: "#fffdf8", text: "#25231f", muted: "#666057", line: "#d9d3c8", rule: "#837b6e", tick: "#9b9488", number: "#645f56" }
    : background === "slate"
      ? { bg: "#18212b", surface: "#202b37", text: "#edf2f7", muted: "#b2bdca", line: "#3d4b5a", rule: "#7f8fa0", tick: "#7f8fa0", number: "#d5dfe8" }
      : background === "tinted"
        ? { ...original, bg: mix("#141414", accent, .08), surface: mix("#1c1c1c", accent, .1), line: mix("#3b3b3b", accent, .12) }
        : original;
  const ink = background === "original" ? accent : readableAccent(accent, palette.bg);
  const darkButtonText = background === "original" ? "#141414" : "#000000";
  return {
    ...palette,
    ink,
    glow: channels(background === "paper" ? ink : accent).join(", "),
    onAccent: feedbackContrast("#ffffff", accent) > feedbackContrast(darkButtonText, accent) ? "#ffffff" : customAccent || background !== "original" ? darkButtonText : "#141412",
  };
}
