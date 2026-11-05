import { describe, expect, it } from "vitest";
import { createCalendarEventFormValues, toCalendarEventMutationPayload } from "./calendar-event-form";
import { getWeekCreationRange, getWeekPointerMinute, getWeekSelectionMinutes, isWeekSelectionDrag } from "./calendar-week-selection";

describe("Week quick creation", () => {
  it("converts column-local pixels to minutes and clamps to the day", () => {
    expect(getWeekPointerMinute(648)).toBe(540);
    expect(getWeekPointerMinute(-20)).toBe(0);
    expect(getWeekPointerMinute(2000)).toBe(1440);
  });

  it.each([0, 14, 15, 29, 30, 45, 59.99])("keeps a click %s minutes into the same hour and preserves the form's default duration", (minute) => {
    expect(getWeekCreationRange("2026-11-05", 9 * 60 + minute)).toEqual({ startDate: "2026-11-05", endDate: "2026-11-05", startTime: "09:00", endTime: "10:00" });
  });

  it("changes the click range at the next hour and clamps to the visible day", () => {
    expect(getWeekCreationRange("2026-11-05", 10 * 60).startTime).toBe("10:00");
    expect(getWeekCreationRange("2026-11-05", -1).startTime).toBe("00:00");
    expect(getWeekCreationRange("2026-11-05", 1440).startTime).toBe("23:00");
  });

  it.each([
    [9 * 60 + 17, 10 * 60 + 8, 9 * 60 + 15, 10 * 60],
    [10 * 60 + 8, 9 * 60 + 17, 9 * 60 + 15, 10 * 60],
    [9 * 60 + 1, 9 * 60 + 8, 9 * 60, 9 * 60 + 15],
    [9 * 60 + 8, 9 * 60 + 1, 9 * 60, 9 * 60 + 15],
    [1, -30, 0, 15],
    [1439, 1500, 1425, 1440],
  ])("normalizes a drag from %i to %i minutes", (anchor, pointer, startMinute, endMinute) => {
    expect(getWeekSelectionMinutes(anchor, pointer)).toEqual({ startMinute, endMinute });
  });

  it("keeps click jitter below the drag threshold", () => {
    expect(isWeekSelectionDrag(100, 100, 100, 100)).toBe(false);
    expect(isWeekSelectionDrag(100, 100, 102, 103)).toBe(false);
    expect(isWeekSelectionDrag(100, 100, 100, 105)).toBe(true);
    expect(isWeekSelectionDrag(100, 100, 100, 95)).toBe(true);
  });

  it("preserves midnight boundaries for clicks and drags", () => {
    expect(getWeekCreationRange("2026-11-05", 1439)).toEqual({ startDate: "2026-11-05", endDate: "2026-11-06", startTime: "23:00", endTime: "00:00" });
    expect(getWeekCreationRange("2026-11-05", 1439, 1440)).toEqual({ startDate: "2026-11-05", endDate: "2026-11-06", startTime: "23:45", endTime: "00:00" });
  });

  it.each([
    ["Europe/Kyiv", "2026-11-05T07:15:00.000Z", "2026-11-05T08:00:00.000Z"],
    ["America/New_York", "2026-11-05T14:15:00.000Z", "2026-11-05T15:00:00.000Z"],
  ])("passes selected wall times through the existing form payload in %s", (timeZone, startsAt, endsAt) => {
    const range = getWeekCreationRange("2026-11-05", 9 * 60 + 17, 10 * 60);
    const values = createCalendarEventFormValues(undefined, range.startDate, timeZone, range);
    expect(values.eventType).toBe("general");
    expect(values.allDay).toBe(false);
    expect(toCalendarEventMutationPayload(values, timeZone)).toMatchObject({ startsAt, endsAt });
    // Manual edits retain the TimePicker's finer precision after quick creation.
    expect(toCalendarEventMutationPayload({ ...values, startTime: "09:05" }, timeZone).startsAt).toContain(":05:");
  });
});
