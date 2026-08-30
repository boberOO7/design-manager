import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getScrollbarWidth } from "./app-scroll-lock";
import { getDrawerTabFocusTarget } from "./drawer";

const drawerPath = new URL("./drawer.tsx", import.meta.url);
const scrollLockPath = new URL("./app-scroll-lock.ts", import.meta.url);
const globalStylesPath = new URL("../../app/globals.css", import.meta.url);

function focusable() {
  return { focus: () => undefined } as unknown as HTMLElement;
}

describe("Drawer focus trap", () => {
  it("wraps Tab from the final control to the first control", () => {
    const first = focusable();
    const last = focusable();
    const panel = focusable();

    expect(getDrawerTabFocusTarget({ activeElement: last, focusable: [first, last], shiftKey: false, panel })).toBe(first);
  });

  it("keeps drawers mounted for synchronized panel and backdrop exit motion", async () => {
    const [source, scrollLock, globalStyles] = await Promise.all([
      readFile(drawerPath, "utf8"),
      readFile(scrollLockPath, "utf8"),
      readFile(globalStylesPath, "utf8"),
    ]);

    expect(source).toContain("transition-opacity duration-[320ms]");
    expect(source).toContain("transition-transform duration-[320ms]");
    expect(source).toContain("translate-x-full");
    expect(source).toContain("onTransitionEnd={handleExitTransition}");
    expect(source).toContain("onTransitionCancel={handleExitTransition}");
    expect(source).toContain("onExited?: () => void");
    expect(source).toContain("lockAppScroll();");
    expect(source).toContain("if (isDrawerScrollLockedRef.current) {");
    expect(source).toContain("unlockAppScroll();");
    expect(source).toContain("createPortal(");
    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain("focus({ preventScroll: true })");
    expect(source).toContain("return document.body;");
    expect(scrollLock).toContain('document.getElementById("main-content")');
    expect(scrollLock).toContain("let appScrollLockCount = 0;");
    expect(scrollLock).toContain('target.style.overflow = "hidden"');
    expect(scrollLock).toContain("getScrollContainerScrollbarWidth(target)");
    expect(scrollLock).toContain('scrollbarGutter.includes("stable")');
    expect(scrollLock).toContain('main && window.getComputedStyle(main).overflowY !== "visible" ? main : document.body');
    expect(scrollLock).not.toContain('documentElement.style.overflow = "hidden"');
    expect(globalStyles).toContain("#main-content {\n    scrollbar-gutter: stable;");
    expect(source).toContain('aria-hidden="true" className={cn("absolute inset-0 bg-[var(--ui-overlay)] transition-opacity');
    expect(source).not.toContain('z-50 bg-[var(--ui-overlay)] transition-opacity');
  });

  it("uses the measured viewport gutter without adding negative compensation", () => {
    expect(getScrollbarWidth(1440, 1424)).toBe(16);
    expect(getScrollbarWidth(1440, 1440)).toBe(0);
    expect(getScrollbarWidth(1024, 1040)).toBe(0);
  });

  it("wraps Shift+Tab from the first control to the final control", () => {
    const first = focusable();
    const last = focusable();
    const panel = focusable();

    expect(getDrawerTabFocusTarget({ activeElement: first, focusable: [first, last], shiftKey: true, panel })).toBe(last);
  });

  it("keeps normal Tab navigation intact and keeps an empty drawer focusable", () => {
    const first = focusable();
    const middle = focusable();
    const last = focusable();
    const panel = focusable();

    expect(getDrawerTabFocusTarget({ activeElement: middle, focusable: [first, middle, last], shiftKey: false, panel })).toBeNull();
    expect(getDrawerTabFocusTarget({ activeElement: null, focusable: [], shiftKey: false, panel })).toBe(panel);
  });
});
