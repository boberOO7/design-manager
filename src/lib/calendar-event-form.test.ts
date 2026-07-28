import { describe, expect, it } from "vitest";
import { getAllDayEventBounds, getInclusiveAllDayEndDate, toCalendarEventMutationPayload, type CalendarEventFormValues } from "./calendar-event-form";
import { calendarEventSchema, timeOffRequestSchema } from "./validation/calendar";
import { CALENDAR_EVENT_TYPES } from "../types/calendar";

const baseValues: CalendarEventFormValues = {
  title: "Studio presentation",
  eventType: "client_presentation",
  projectId: "",
  allDay: true,
  startDate: "2026-07-28",
  endDate: "2026-07-28",
  startTime: "09:00",
  endTime: "10:00",
  attendeeIds: [],
  location: "",
  meetingUrl: "",
  description: "",
};

describe("Calendar event form time semantics", () => {
  it("stores a single all-day date as a positive one-day Kyiv interval", () => {
    const bounds = getAllDayEventBounds("2026-07-28", "2026-07-28");
    expect(bounds).toEqual({ startsAt: "2026-07-27T21:00:00.000Z", endsAt: "2026-07-28T21:00:00.000Z" });
    expect(new Date(bounds.endsAt).getTime() - new Date(bounds.startsAt).getTime()).toBe(24 * 60 * 60 * 1000);
    expect(getInclusiveAllDayEndDate(bounds.endsAt)).toBe("2026-07-28");
  });

  it("uses an exclusive boundary after the selected multi-day all-day end", () => {
    const bounds = getAllDayEventBounds("2026-10-24", "2026-10-26");
    expect(bounds.startsAt).toBe("2026-10-23T21:00:00.000Z");
    expect(bounds.endsAt).toBe("2026-10-26T22:00:00.000Z");
    expect(getInclusiveAllDayEndDate(bounds.endsAt)).toBe("2026-10-26");
  });

  it("does not shift a Kyiv calendar date through UTC parsing", () => {
    const bounds = getAllDayEventBounds("2026-01-05", "2026-01-05");
    expect(bounds.startsAt).toBe("2026-01-04T22:00:00.000Z");
    expect(getInclusiveAllDayEndDate(bounds.endsAt)).toBe("2026-01-05");
  });

  it("keeps timed event date and time inputs as timed instants", () => {
    const payload = toCalendarEventMutationPayload({ ...baseValues, allDay: false, startDate: "2026-07-28", endDate: "2026-07-28", startTime: "09:00", endTime: "10:00" });
    expect(payload.startsAt).toBe("2026-07-28T06:00:00.000Z");
    expect(payload.endsAt).toBe("2026-07-28T07:00:00.000Z");
  });

  it("keeps entered values intact when an invalid all-day range fails before submission", () => {
    const values = { ...baseValues, startDate: "2026-07-29", endDate: "2026-07-28" };
    expect(() => toCalendarEventMutationPayload(values)).toThrow("Invalid all-day date range");
    expect(values).toEqual({ ...baseValues, startDate: "2026-07-29", endDate: "2026-07-28" });
  });
});

describe("Calendar event and time-off payload validation", () => {
  it("accepts every supported event enum value", () => {
    for (const eventType of CALENDAR_EVENT_TYPES) {
      expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload({ ...baseValues, eventType }), eventType }).success).toBe(true);
    }
  });

  it("submits Presentation as client_presentation", () => {
    expect(toCalendarEventMutationPayload(baseValues).eventType).toBe("client_presentation");
  });

  it("rejects browser-supplied time-off user IDs", () => {
    expect(timeOffRequestSchema.safeParse({ requestType: "vacation", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, privateNote: "", userId: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(false);
  });
});
