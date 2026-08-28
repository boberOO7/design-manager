import { describe, expect, it } from "vitest";
import { updateLinkedStartDate, updateLinkedStartTime, type CalendarFormRangeValues } from "./calendar-form-range";

const partialDayOff: CalendarFormRangeValues = {
  allDay: false,
  startDate: "2026-08-29",
  endDate: "2026-08-29",
  startTime: "09:00",
  endTime: "10:00",
};

describe("linked calendar form ranges", () => {
  it("moves a linked end date with the start date", () => {
    expect(updateLinkedStartDate({ ...partialDayOff, allDay: true }, "2026-09-03", true)).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-03" });
  });

  it("retains a valid manually selected end date", () => {
    expect(updateLinkedStartDate({ ...partialDayOff, allDay: true, endDate: "2026-09-05" }, "2026-09-03", false)).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-05" });
  });

  it("moves linked end times by their previous duration", () => {
    expect(updateLinkedStartTime(partialDayOff, "12:30", true)).toMatchObject({ startTime: "12:30", endTime: "13:30" });
    expect(updateLinkedStartTime({ ...partialDayOff, endTime: "11:00" }, "14:00", true)).toMatchObject({ startTime: "14:00", endTime: "16:00" });
  });

  it("preserves a valid manual end time and repairs an invalid one", () => {
    expect(updateLinkedStartTime({ ...partialDayOff, endTime: "16:00" }, "11:00", false)).toMatchObject({ startTime: "11:00", endTime: "16:00" });
    expect(updateLinkedStartTime({ ...partialDayOff, endTime: "14:00" }, "15:00", false)).toMatchObject({ startTime: "15:00", endTime: "16:00" });
  });

  it("keeps an overnight range chronologically valid", () => {
    expect(updateLinkedStartTime(partialDayOff, "23:30", true)).toMatchObject({ startDate: "2026-08-29", endDate: "2026-08-30", startTime: "23:30", endTime: "00:30" });
  });
});
