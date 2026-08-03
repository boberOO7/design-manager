import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const switchPath = new URL("./theme-switch.tsx", import.meta.url);
const shellControlPath = new URL("./shell-control.tsx", import.meta.url);
const layoutPath = new URL("../../app/layout.tsx", import.meta.url);
const stylesPath = new URL("../../app/globals.css", import.meta.url);

describe("theme switch contract", () => {
  it("persists explicit choices and follows system changes before that", async () => {
    const source = await readFile(switchPath, "utf8");
    expect(source).toContain('window.matchMedia("(prefers-color-scheme: dark)")');
    expect(source).toContain('window.localStorage.setItem(THEME_STORAGE_KEY, next)');
    expect(source).toContain('media.addEventListener("change", syncSystemTheme)');
    expect(source).toContain("`Switch to ${nextTheme} theme`");
  });

  it("uses stable transform and opacity motion with a reduced-motion fallback", async () => {
    const [source, styles, shellControl] = await Promise.all([
      readFile(switchPath, "utf8"),
      readFile(stylesPath, "utf8"),
      readFile(shellControlPath, "utf8"),
    ]);
    expect(styles).toContain("transition: transform 200ms ease-out, opacity 200ms ease-out");
    expect(styles).toContain(".theme-switch__icon");
    expect(styles).toContain("transition: none");
    expect(source).toContain("size-11");
    expect(shellControl).toContain("focus-visible:ring-2");
  });

  it("installs the pre-paint bootstrap and dark semantic token layer", async () => {
    const [layout, styles] = await Promise.all([
      readFile(layoutPath, "utf8"),
      readFile(stylesPath, "utf8"),
    ]);
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).toContain("themeBootstrapScript");
    expect(layout).toContain('colorScheme: "light dark"');
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("color-scheme: dark");
  });
});
