import { describe, expect, it } from "vitest";
import { getDrawerTabFocusTarget } from "./drawer";

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
