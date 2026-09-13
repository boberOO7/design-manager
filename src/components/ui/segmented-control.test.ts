import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSegmentedControlItemProps } from "./segmented-control";

const source = readFileSync("src/components/ui/segmented-control.tsx", "utf8");

describe("segmented control semantics", () => {
  it("marks only the selected item as pressed", () => {
    expect(getSegmentedControlItemProps(true)["aria-pressed"]).toBe(true);
    expect(getSegmentedControlItemProps(false)["aria-pressed"]).toBe(false);
  });

  it("uses one restrained moving selection indicator", () => {
    expect(source).toContain("data-segmented-indicator");
    expect(source).toContain("translateX(${Math.max(0, selectedIndex) * 100}%)");
    expect(source).toContain("duration-200");
    expect(source).toContain("motion-reduce:transition-none");
  });
});
