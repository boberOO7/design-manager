import { describe, expect, it } from "vitest";
import { summarizeProjectCalendarTime, type ProjectCalendarEvent } from "./project-calendar-time";

const now = new Date("2026-09-27T12:00:00Z");
const event = (values: Partial<ProjectCalendarEvent>): ProjectCalendarEvent => ({
  project_id: "project-a", event_type: "site_visit", starts_at: "2026-09-25T10:00:00Z",
  ends_at: "2026-09-25T12:00:00Z", cancelled_at: null, ...values,
});

describe("project Calendar time", () => {
  it("sums ended site visits and business trips from the linked project across dates and timezones", () => {
    expect(summarizeProjectCalendarTime([
      event({}),
      event({ event_type: "business_trip", starts_at: "2026-09-25T22:30:00+03:00", ends_at: "2026-09-26T02:00:00+02:00" }),
      event({ project_id: "project-b" }),
      event({ event_type: "meeting" }),
      event({ cancelled_at: "2026-09-26T00:00:00Z" }),
      event({ starts_at: "2026-09-27T11:00:00Z", ends_at: "2026-09-27T13:00:00Z" }),
    ], "project-a", now)).toEqual({ count: 2, minutes: 390 });
  });

  it("returns zero when no qualifying event has ended", () => {
    expect(summarizeProjectCalendarTime([event({ project_id: "project-b" })], "project-a", now)).toEqual({ count: 0, minutes: 0 });
  });
});
