import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInNewContext } from "node:vm";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentBootstrap } from "./document-bootstrap";

const insertions = vi.hoisted(() => [] as Array<() => ReactNode>);
vi.mock("next/navigation", () => ({
  useServerInsertedHTML: (callback: () => ReactNode) => insertions.push(callback),
}));

beforeEach(() => { insertions.length = 0; });

it("emits executable scripts only once through the server document insertion", () => {
  // React's normal tree (including a client recovery/remount) has no scripts.
  expect(renderToStaticMarkup(<DocumentBootstrap />)).toBe("");
  expect(insertions).toHaveLength(1);
  const flush = insertions[0];
  const markup = renderToStaticMarkup(<>{flush()}</>);
  expect(markup.match(/<script /g)).toHaveLength(2);
  expect(markup).toContain('id="motion-bootstrap"');
  expect(markup).toContain('id="theme-bootstrap"');
  expect(markup).not.toContain("__next_s");
  expect(flush()).toBeNull();
});

it.each([
  { storedTheme: "dark", storedMotion: "off", systemDark: false, blocked: false, theme: "dark", motion: "off" },
  { storedTheme: "light", storedMotion: "system", systemDark: true, blocked: false, theme: "light", motion: "system" },
  { storedTheme: null, storedMotion: null, systemDark: true, blocked: false, theme: "dark", motion: "on" },
  { storedTheme: null, storedMotion: null, systemDark: true, blocked: true, theme: "dark", motion: "on" },
])("initializes preferences from parser-executed head scripts: $theme/$motion", (preferences) => {
  renderToStaticMarkup(<DocumentBootstrap />);
  const markup = renderToStaticMarkup(<>{insertions[0]()}</>);
  const root = { dataset: { motion: "on" }, style: {} };
  const context = {
    document: { documentElement: root, querySelectorAll: () => [] },
    localStorage: { getItem: (key: string) => {
      if (preferences.blocked) throw new Error("storage blocked");
      return key === "studioflow-theme" ? preferences.storedTheme : preferences.storedMotion;
    } },
    matchMedia: () => ({ matches: preferences.systemDark }),
  };
  for (const script of markup.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) runInNewContext(script[1], context);
  expect(root.dataset).toMatchObject({ theme: preferences.theme, motion: preferences.motion });
  expect(root.style).toMatchObject({ colorScheme: preferences.theme });
  // A navigation/remount does not reset the user's initialized preferences.
  expect(renderToStaticMarkup(<DocumentBootstrap />)).toBe("");
  expect(root.dataset).toMatchObject({ theme: preferences.theme, motion: preferences.motion });
});
