import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isTimePickerDiscreteWheel, TIME_PICKER_HOURS, TIME_PICKER_MINUTES, TIME_PICKER_ROW_HEIGHT } from "./time-picker";

const globalsPath = new URL("../../app/globals.css", import.meta.url);

describe("TimePicker options", () => {
  it("offers every hour and only five-minute choices", () => {
    expect(TIME_PICKER_HOURS).toEqual(Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")));
    expect(TIME_PICKER_MINUTES).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
  });

  it("uses the shared scrollbar utility on the scrolling columns", async () => {
    const globals = await readFile(globalsPath, "utf8");
    expect(globals).toContain(".scrollbar-none::-webkit-scrollbar");
    expect(globals).toContain("width: 0 !important");
    expect(globals).toContain("height: 0 !important");
  });

  it("identifies traditional and Windows Chromium mouse-wheel events as discrete", () => {
    expect(TIME_PICKER_ROW_HEIGHT).toBe(40);
    expect(isTimePickerDiscreteWheel(100, 0)).toBe(true);
    expect(isTimePickerDiscreteWheel(-3, 1)).toBe(true);
  });

  it("leaves continuous trackpad pixel deltas to native scrolling", () => {
    expect(isTimePickerDiscreteWheel(15, 0)).toBe(false);
    expect(isTimePickerDiscreteWheel(-15, 0)).toBe(false);
  });
});
