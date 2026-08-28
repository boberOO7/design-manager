import { describe, expect, it } from "vitest";
import {
  canCreateCalendarEventType,
  canCreateTimeOffRequestType,
  getCreatableCalendarEventTypes,
  getCreatableTimeOffRequestTypes,
} from "./calendar-creation";

describe("calendar creation types by role", () => {
  it("keeps employee absence requests separate from calendar events", () => {
    expect(getCreatableTimeOffRequestTypes("employee")).toEqual(["vacation", "day_off", "sick_leave"]);
    expect(getCreatableCalendarEventTypes("employee")).toEqual(["work_makeup", "site_visit", "meeting", "business_trip"]);
  });

  it("exposes the requested admin creation matrix", () => {
    expect(getCreatableTimeOffRequestTypes("admin")).toEqual(["sick_leave", "vacation"]);
    expect(getCreatableCalendarEventTypes("admin")).toEqual(["meeting", "interview", "site_visit", "business_trip", "other"]);
  });

  it("does not authorize unavailable types through a direct request", () => {
    expect(canCreateCalendarEventType("employee", "other")).toBe(false);
    expect(canCreateCalendarEventType("employee", "work_makeup")).toBe(true);
    expect(canCreateCalendarEventType("employee", "interview")).toBe(false);
    expect(canCreateCalendarEventType("admin", "interview")).toBe(true);
    expect(canCreateTimeOffRequestType("admin", "day_off")).toBe(false);
    expect(canCreateTimeOffRequestType("employee", "day_off")).toBe(true);
  });
});
