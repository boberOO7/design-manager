import { describe, expect, it } from "vitest";
import { resolveLocale } from "./config";

describe("locale resolution", () => {
  it("uses a valid explicit preference before browser language", () => {
    expect(resolveLocale("uk", "en-US,en;q=0.9")).toBe("uk");
  });

  it("uses Ukrainian browser language only without a preference and safely falls back to English", () => {
    expect(resolveLocale(undefined, "uk-UA,uk;q=0.9")).toBe("uk");
    expect(resolveLocale("invalid", "fr-FR,fr;q=0.9")).toBe("en");
  });
});
