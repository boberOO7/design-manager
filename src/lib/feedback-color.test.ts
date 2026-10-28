import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex } from "./feedback-color";

describe("feedback colour picker", () => {
  it.each(["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#888888", "#e3ca9c", "#89a9d8", "#66ff00"])("round-trips %s without changing its saved colour", hex => {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
  it("converts primary hues, grey and the ends of the hue strip", () => {
    expect(hsvToHex({ h: 120, s: 100, v: 100 })).toBe("#00ff00");
    expect(hsvToHex({ h: 360, s: 100, v: 100 })).toBe("#ff0000");
    expect(hsvToHex({ h: 240, s: 0, v: 50 })).toBe("#808080");
  });
  it("retains hue on grey and hue/saturation on black", () => {
    const previous = { h: 210, s: 70, v: 80 };
    expect(hexToHsv("#000000", previous)).toEqual({ h: 210, s: 70, v: 0 });
    expect(hexToHsv("#ffffff", previous)).toEqual({ h: 210, s: 0, v: 100 });
  });
});
