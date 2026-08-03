"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { ShellControl } from "@/components/layout/shell-control";
import {
  DARK_THEME_COLOR,
  getNextTheme,
  LIGHT_THEME_COLOR,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
} from "@/lib/theme";

const themeChangeEvent = "studioflow-theme-change";

function syncThemeColor(theme: ResolvedTheme) {
  const color = theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = color;
  });
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  syncThemeColor(theme);
  window.dispatchEvent(new Event(themeChangeEvent));
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => window.removeEventListener(themeChangeEvent, onStoreChange);
}

function getThemeSnapshot(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): ResolvedTheme {
  return "light";
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));

    function syncSystemTheme(event?: MediaQueryListEvent) {
      if (parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) !== "system") return;
      const resolved = resolveTheme("system", event?.matches ?? media.matches);
      applyTheme(resolved);
    }

    const resolved = resolveTheme(preference, media.matches);
    applyTheme(resolved);
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  const nextTheme = getNextTheme(theme);
  const label = `Switch to ${nextTheme} theme`;

  function toggleTheme() {
    const next = getNextTheme(theme);
    applyTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return (
    <ShellControl
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="group size-11"
    >
      <span className="relative block size-5 overflow-hidden" aria-hidden="true">
        <Sun
          className="theme-switch__icon theme-switch__sun absolute inset-0 size-5"
        />
        <Moon
          className="theme-switch__icon theme-switch__moon absolute inset-0 size-5"
        />
      </span>
    </ShellControl>
  );
}
