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
    expect(getCreatableCalendarEventTypes("employee")).toEqual(["general", "meeting", "presentation", "site_visit", "business_trip", "work_makeup"]);
  });

  it("exposes the requested admin creation matrix", () => {
    expect(getCreatableTimeOffRequestTypes("admin")).toEqual(["sick_leave", "vacation"]);
    expect(getCreatableCalendarEventTypes("admin")).toEqual(["general", "meeting", "presentation", "interview", "site_visit", "business_trip"]);
  });

  it("does not authorize unavailable types through a direct request", () => {
    expect(canCreateCalendarEventType("employee", "general")).toBe(true);
    expect(canCreateCalendarEventType("employee", "work_makeup")).toBe(true);
    expect(canCreateCalendarEventType("employee", "interview")).toBe(false);
    expect(canCreateCalendarEventType("admin", "interview")).toBe(true);
    expect(canCreateTimeOffRequestType("admin", "day_off")).toBe(false);
    expect(canCreateTimeOffRequestType("employee", "day_off")).toBe(true);
  });
});
