import { afterEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceMotion } from "./project-workspace-motion";

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], index: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (current: unknown) => hooks.refs[hooks.index++] ?? (hooks.refs[hooks.index - 1] = { current }),
  useLayoutEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
afterEach(() => { hooks.refs = []; hooks.index = 0; hooks.effects = []; vi.unstubAllGlobals(); });

it.each([300, 900])("holds space while loading, then shows the complete %ipx content without a height reveal", finalHeight => {
  let contentHeight = 600, loading = false;
  const styles = new Map<string, string>();
  const outer = {
    style: {
      set height(value: string) { styles.set("height", value); },
      set minHeight(value: string) { styles.set("min-height", value); },
      removeProperty: (name: string) => styles.delete(name),
    },
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ height: Math.max(contentHeight, Number.parseFloat(styles.get("min-height") ?? "0")) }),
    animate: vi.fn(),
  };
  const inner = {
    getBoundingClientRect: () => ({ height: contentHeight }),
    querySelectorAll: () => loading ? [{ getClientRects: () => [{}] }] : [],
  };
  const mutations: (() => void)[] = [];
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { mutations.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("document", Object.assign(new EventTarget(), { documentElement: { dataset: {} } }));
  vi.stubGlobal("window", { matchMedia: () => Object.assign(new EventTarget(), { matches: false }) });
  const render = (motionKey: string) => {
    hooks.index = 0;
    hooks.effects = [];
    ProjectWorkspaceMotion({ motionKey, children: null });
  };
  render("overview");
  hooks.refs[0].current = outer;
  hooks.refs[1].current = inner;
  const cleanup = hooks.effects[0]();
  hooks.effects[1]();
  try {
    contentHeight = 300;
    loading = true;
    render("finance");
    hooks.effects[1]();
    expect(styles.get("min-height")).toBe("600px");
    expect(outer.animate).not.toHaveBeenCalled();
    // Streaming can replace the fallback without changing its measured size.
    mutations[0]();
    expect(outer.animate).not.toHaveBeenCalled();
    loading = false;
    contentHeight = finalHeight;
    mutations[0]();
    expect(styles.has("min-height")).toBe(false);
    expect(outer.animate).not.toHaveBeenCalled();
    expect(styles.size).toBe(0);
    expect(outer.dataset.resizing).toBeUndefined();
  } finally { cleanup?.(); }
});
