import { describe, expect, it } from "vitest";
import { CALENDAR_EVENT_TYPE_CONFIG } from "./calendar-event-types";

describe("calendar event semantic types", () => {
  it("provides a localized label, semantic tone, and icon for every persisted type", () => {
    expect(Object.keys(CALENDAR_EVENT_TYPE_CONFIG)).toEqual(["general", "meeting", "interview", "site_visit", "business_trip", "presentation", "internal_review", "work_makeup"]);
    expect(CALENDAR_EVENT_TYPE_CONFIG.presentation.labelKey).toBe("presentation");
    expect(CALENDAR_EVENT_TYPE_CONFIG.business_trip.tone).toContain("business-trip");
  });
});
