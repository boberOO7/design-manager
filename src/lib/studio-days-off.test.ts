import { describe, expect, it } from "vitest";
import { getStudioDayOffDates, studioDayOffItem } from "./studio-days-off";
import { studioDayOffUpdateSchema, studioDaysOffCreateSchema } from "./validation/studio-days-off";
import { getWorkdayKind } from "./workdays";

const name = "Winter break";
describe("Company days off periods", () => {
  it("validates a real inclusive period and rejects invalid dates, reversal and injected tenant fields", () => {
    expect(studioDaysOffCreateSchema.parse({ name, startDate: "2027-01-07", endDate: "2027-01-10" })).toMatchObject({ startDate: "2027-01-07", endDate: "2027-01-10", note: null });
    for (const value of [
      { name, startDate: "2027-02-30", endDate: "2027-03-01" },
      { name, startDate: "2027-01-10", endDate: "2027-01-07" },
      { name, startDate: "2027-01-07", endDate: "2027-01-10", studio_id: "other" },
      { name: " ", startDate: "2027-01-07", endDate: "2027-01-10" },
    ]) expect(studioDaysOffCreateSchema.safeParse(value).success).toBe(false);
  });

  it("preserves single-day callers and validates separate dates without allowing duplicate selections or splitting on update", () => {
    expect(studioDaysOffCreateSchema.parse({ name, date: "2027-01-07" })).toMatchObject({ date: "2027-01-07" });
    expect(studioDaysOffCreateSchema.safeParse({ name, dates: ["2027-01-07", "2027-01-10"] }).success).toBe(true);
    expect(studioDaysOffCreateSchema.safeParse({ name, dates: ["2027-01-07", "2027-01-07"] }).success).toBe(false);
    expect(studioDayOffUpdateSchema.safeParse({ name, dates: ["2027-01-07", "2027-01-10"] }).success).toBe(false);
  });

  it("projects one saved period as one multi-day calendar item", () => {
    const item = studioDayOffItem({ id: "period", date: "2026-12-29", end_date: "2027-01-03", name, note: null });
    expect(item).toMatchObject({ key: "studio-day-off:period", startDate: "2026-12-29", endDate: "2027-01-03", allDay: true });
    expect(studioDayOffItem({ id: "legacy", date: "2027-01-01", end_date: null, name, note: null }).endDate).toBe("2027-01-01");
  });

  it("classifies every covered day, including middle/end dates, and clips cross-year periods to the requested work window", () => {
    const dates = getStudioDayOffDates([{ date: "2026-12-29", end_date: "2027-01-07" }, { date: "2027-01-12", end_date: null }], { start: "2027-01-04", end: "2027-01-08" });
    expect(dates).toEqual(["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
    expect(getWorkdayKind("2027-01-06", { joinedDate: null, studioDaysOff: dates })).toBe("studio_day_off");
    expect(getWorkdayKind("2027-01-07", { joinedDate: null, studioDaysOff: dates })).toBe("studio_day_off");
    expect(getWorkdayKind("2027-01-08", { joinedDate: null, studioDaysOff: dates })).toBe("day");
  });
});
