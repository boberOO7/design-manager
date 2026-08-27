import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pickerPath = new URL("./date-picker.tsx", import.meta.url);

describe("DatePicker navigation", () => {
  it("uses a Ukrainian caption without the calendar-year suffix", async () => {
    const source = await readFile(pickerPath, "utf8");

    expect(source).toContain('if (locale.startsWith("uk")) return `${monthLabel(date, locale)} ${date.getFullYear()}`');
    expect(source).toContain('month.replace(/\\.$/u, "")');
  });

  it("supports day, month, and year selection within the shared picker", async () => {
    const source = await readFile(pickerPath, "utf8");

    expect(source).toContain('type CalendarView = "day" | "month" | "year"');
    expect(source).toContain('setCalendarView("month")');
    expect(source).toContain('setCalendarView("year")');
    expect(source).toContain('setCalendarView("day")');
    expect(source).toContain('grid grid-cols-3 gap-1');
    expect(source).toContain('offset * 12');
  });

  it("keeps the existing minimum-date boundary in every navigation level", async () => {
    const source = await readFile(pickerPath, "utf8");

    expect(source).toContain('const isMonthAvailable');
    expect(source).toContain('const isYearAvailable');
    expect(source).toContain('const unavailable = Boolean(minValue && dateValue < minValue)');
  });
});
