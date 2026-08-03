export const THEME_STORAGE_KEY = "studioflow-theme";
export const LIGHT_THEME_COLOR = "#f8f5ef";
export const DARK_THEME_COLOR = "#141311";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function getNextTheme(theme: ResolvedTheme): ResolvedTheme {
  return theme === "light" ? "dark" : "light";
}

export const themeBootstrapScript = `(() => {
  try {
    const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const resolved = preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : preference === "dark" ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    const themeColor = resolved === "dark" ? "${DARK_THEME_COLOR}" : "${LIGHT_THEME_COLOR}";
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", themeColor));
  } catch {
    const resolved = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }
})();`;
