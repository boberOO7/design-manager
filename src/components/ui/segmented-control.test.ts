import { describe, expect, it } from "vitest";
import { getSegmentedControlItemProps } from "./segmented-control";

describe("segmented control semantics", () => {
  it("marks only the selected item as pressed", () => {
    expect(getSegmentedControlItemProps(true)["aria-pressed"]).toBe(true);
    expect(getSegmentedControlItemProps(false)["aria-pressed"]).toBe(false);
  });
});
