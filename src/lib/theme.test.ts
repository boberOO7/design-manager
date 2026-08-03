import { describe, expect, it } from "vitest";
import {
  getNextTheme,
  parseThemePreference,
  resolveTheme,
  themeBootstrapScript,
} from "./theme";

describe("theme preference", () => {
  it("uses system preference until the user stores an explicit theme", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("unexpected")).toBe("system");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("keeps explicit preferences independent of the system theme", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(getNextTheme("light")).toBe("dark");
    expect(getNextTheme("dark")).toBe("light");
  });

  it("bootstraps the resolved theme before hydration", () => {
    expect(themeBootstrapScript).toContain("localStorage.getItem");
    expect(themeBootstrapScript).toContain("prefers-color-scheme: dark");
    expect(themeBootstrapScript).toContain("root.dataset.theme = resolved");
    expect(themeBootstrapScript).toContain("root.style.colorScheme = resolved");
    expect(themeBootstrapScript).toContain("meta[name=\"theme-color\"]");
  });
});
