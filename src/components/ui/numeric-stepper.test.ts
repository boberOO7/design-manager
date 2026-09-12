import { describe, expect, it } from "vitest";
import { stepNumericText } from "./numeric-stepper";

describe("numeric stepper", () => {
  it("steps within bounds and preserves inventory padding", () => {
    expect(stepNumericText("02", 1, 1, 1_000_000, true)).toBe("03");
    expect(stepNumericText("10", -1, 1, 1_000_000, true)).toBe("09");
    expect(stepNumericText("1", -1)).toBe("1");
  });
});
