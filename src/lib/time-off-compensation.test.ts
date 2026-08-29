import { describe, expect, it } from "vitest";
import { DEFAULT_WORKDAY_MINUTES, getDayOffCompensation, getRequiredDayOffMinutes, getWorkMakeupMinutes } from "./time-off-compensation";

const partialDayOff = { id: "day-off", startDate: "2026-08-28", endDate: "2026-08-28", startTime: "14:00", endTime: "18:00", allDay: false };
const makeup = (id: string, startsAt: string, endsAt: string, cancelledAt: string | null = null) => ({ id, startsAt, endsAt, allDay: false, cancelledAt, compensatesTimeOffRequestId: "day-off" });

describe("day-off compensation", () => {
  it("calculates partial-day compensation in minutes", () => {
    expect(getDayOffCompensation(partialDayOff, [makeup("m1", "2026-08-29T06:00:00.000Z", "2026-08-29T08:00:00.000Z")])).toEqual({ requiredMinutes: 240, compensatedMinutes: 120, remainingMinutes: 120 });
  });

  it("adds multiple makeup events without counting an event twice", () => {
    const first = makeup("m1", "2026-08-29T06:00:00.000Z", "2026-08-29T08:00:00.000Z");
    const second = makeup("m2", "2026-08-30T06:00:00.000Z", "2026-08-30T08:30:00.000Z");
    expect(getDayOffCompensation(partialDayOff, [first, first, second])).toEqual({ requiredMinutes: 240, compensatedMinutes: 270, remainingMinutes: 0 });
  });

  it("recalculates after unlinking or cancelling a makeup event", () => {
    const linked = makeup("m1", "2026-08-29T06:00:00.000Z", "2026-08-29T10:00:00.000Z");
    expect(getDayOffCompensation(partialDayOff, [{ ...linked, compensatesTimeOffRequestId: null }]).remainingMinutes).toBe(240);
    expect(getDayOffCompensation(partialDayOff, [{ ...linked, cancelledAt: "2026-08-29T11:00:00.000Z" }]).remainingMinutes).toBe(240);
  });

  it("uses the centralized eight-hour fallback for all-day day-offs", () => {
    expect(DEFAULT_WORKDAY_MINUTES).toBe(480);
    expect(getRequiredDayOffMinutes({ ...partialDayOff, allDay: true, startDate: "2026-08-28", endDate: "2026-08-28", startTime: null, endTime: null })).toBe(480);
    expect(getWorkMakeupMinutes({ startsAt: "2026-08-28T00:00:00.000Z", endsAt: "2026-08-29T00:00:00.000Z", allDay: true })).toBe(480);
  });
});
