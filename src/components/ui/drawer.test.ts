import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getDrawerTabFocusTarget } from "./drawer";

const drawerPath = new URL("./drawer.tsx", import.meta.url);

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
    const source = await readFile(drawerPath, "utf8");

    expect(source).toContain("transition-opacity duration-[320ms]");
    expect(source).toContain("transition-transform duration-[320ms]");
    expect(source).toContain("translate-x-full");
    expect(source).toContain("onTransitionEnd={handlePanelTransitionEnd}");
    expect(source).toContain("onExited?: () => void");
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
