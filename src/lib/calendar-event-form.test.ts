import { describe, expect, it } from "vitest";
import { getAllDayEventBounds, getBusinessTripTitle, getInclusiveAllDayEndDate, getSiteVisitTitle, getWorkMakeupTitle, toCalendarEventMutationPayload, updateEventStartDate, updateEventStartTime, type CalendarEventFormValues } from "./calendar-event-form";
import { calendarEventSchema, timeOffRequestSchema } from "./validation/calendar";
import { getTimeOffRequestPresentation } from "./time-off-labels";
import { CALENDAR_EVENT_TYPES } from "../types/calendar";

const baseValues: CalendarEventFormValues = {
  title: "Studio presentation",
  eventType: "presentation",
  projectId: "",
  allDay: true,
  startDate: "2026-07-28",
  endDate: "2026-07-28",
  startTime: "09:00",
  endTime: "10:00",
  attendeeIds: [],
  participantIds: [],
  location: "",
  meetingUrl: "",
  meetingMode: "offline",
  description: "",
};

describe("Calendar event form time semantics", () => {
  it("moves the linked end date with a changed start date while preserving the end time", () => {
    expect(updateEventStartDate({ ...baseValues, allDay: false, endTime: "10:00" }, "2026-09-03", true)).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-03", endTime: "10:00" });
  });

  it("preserves a manually selected multi-day end date when the start date changes", () => {
    expect(updateEventStartDate({ ...baseValues, allDay: false, endDate: "2026-09-05" }, "2026-09-03", false)).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-05" });
  });

  it("moves a linked end time by the existing duration when the start time changes", () => {
    expect(updateEventStartTime({ ...baseValues, allDay: false }, "11:00", true)).toMatchObject({ startTime: "11:00", endDate: "2026-07-28", endTime: "12:00" });
    expect(updateEventStartTime({ ...baseValues, allDay: false, startTime: "12:00", endTime: "13:00" }, "14:30", true)).toMatchObject({ startTime: "14:30", endDate: "2026-07-28", endTime: "15:30" });
    expect(updateEventStartTime({ ...baseValues, allDay: false, startTime: "12:00", endTime: "14:00" }, "15:00", true)).toMatchObject({ startTime: "15:00", endDate: "2026-07-28", endTime: "17:00" });
  });

  it("rolls a linked end time onto the next date", () => {
    expect(updateEventStartTime({ ...baseValues, allDay: false, startTime: "12:00", endTime: "13:00" }, "23:30", true)).toMatchObject({ startTime: "23:30", endDate: "2026-07-29", endTime: "00:30" });
  });

  it("preserves a valid manually edited end time", () => {
    expect(updateEventStartTime({ ...baseValues, allDay: false, endTime: "16:00" }, "11:00", false)).toMatchObject({ startTime: "11:00", endDate: "2026-07-28", endTime: "16:00" });
  });

  it("repairs a manually edited end time that becomes earlier than start", () => {
    expect(updateEventStartTime({ ...baseValues, allDay: false, endTime: "14:00" }, "15:00", false)).toMatchObject({ startTime: "15:00", endDate: "2026-07-28", endTime: "16:00" });
  });

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
      const values = eventType === "site_visit" ? { ...baseValues, eventType, allDay: false, projectId: "123e4567-e89b-12d3-a456-426614174001", assigneeId: "123e4567-e89b-12d3-a456-426614174002" } : eventType === "interview" ? { ...baseValues, eventType, allDay: false, assigneeId: "123e4567-e89b-12d3-a456-426614174002" } : eventType === "business_trip" ? { ...baseValues, eventType, projectId: "123e4567-e89b-12d3-a456-426614174001" } : eventType === "meeting" || eventType === "presentation" ? { ...baseValues, eventType, allDay: false } : { ...baseValues, eventType };
      expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload(values), eventType }).success).toBe(true);
    }
  });

  it("rejects legacy aliases and presentation metadata before they can reach Postgres", () => {
    for (const eventType of ["client_presentation", "Presentation", "Презентація"] as const) {
      expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload(baseValues), eventType }).success).toBe(false);
    }
  });

  it("requires a timed project assignment for site visits", () => {
    const values = { ...baseValues, eventType: "site_visit" as const, allDay: false };
    expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload(values), eventType: "site_visit" }).success).toBe(false);
  });

  it("rejects site visits that cross a Kyiv calendar day", () => {
    const values = { ...baseValues, eventType: "site_visit" as const, allDay: false, projectId: "123e4567-e89b-12d3-a456-426614174001", assigneeId: "123e4567-e89b-12d3-a456-426614174002", startDate: "2026-08-29", endDate: "2026-08-30" };
    expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload(values), eventType: "site_visit" }).success).toBe(false);
  });

  it("requires a same-day timed interviewer without project, invitations, or location", () => {
    const interview = { ...baseValues, eventType: "interview" as const, allDay: false, assigneeId: "123e4567-e89b-12d3-a456-426614174002", startDate: "2026-08-29", endDate: "2026-08-30" };
    const payload = toCalendarEventMutationPayload(interview);
    expect(payload.endsAt).toBe("2026-08-29T07:00:00.000Z");
    expect(calendarEventSchema.safeParse({ ...payload, assigneeId: null }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...payload, projectId: "123e4567-e89b-12d3-a456-426614174001" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...payload, attendeeIds: ["123e4567-e89b-12d3-a456-426614174003"] }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...payload, location: "Studio" }).success).toBe(false);
  });

  it("keeps meetings within one Kyiv calendar day and normalizes their mode-specific fields", () => {
    const crossDayMeeting = { ...baseValues, eventType: "meeting" as const, allDay: false, startDate: "2026-08-29", endDate: "2026-08-30" };
    const normalizedPayload = toCalendarEventMutationPayload(crossDayMeeting);
    expect(normalizedPayload.endsAt).toBe("2026-08-29T07:00:00.000Z");
    expect(calendarEventSchema.safeParse({ ...normalizedPayload, endsAt: "2026-08-30T07:00:00.000Z" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload({ ...baseValues, eventType: "meeting", allDay: false }), meetingUrl: "https://meet.example.com" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...toCalendarEventMutationPayload({ ...baseValues, eventType: "meeting", allDay: false, meetingMode: "online" }), location: "Studio" }).success).toBe(false);
  });

  it("defaults a meeting mode only for meetings and presentations", () => {
    expect(calendarEventSchema.parse({ ...toCalendarEventMutationPayload({ ...baseValues, eventType: "meeting", allDay: false }), meetingMode: undefined }).meetingMode).toBe("offline");
    expect(calendarEventSchema.parse(toCalendarEventMutationPayload({ ...baseValues, eventType: "site_visit", allDay: false, projectId: "123e4567-e89b-12d3-a456-426614174001", assigneeId: "123e4567-e89b-12d3-a456-426614174002", meetingMode: "online" })).meetingMode).toBeNull();
  });

  it("submits Presentation as presentation", () => {
    expect(toCalendarEventMutationPayload(baseValues).eventType).toBe("presentation");
  });

  it("derives localized business-trip titles from the selected project", () => {
    expect(getBusinessTripTitle("Riverside", "en")).toBe("Business trip · Riverside");
    expect(getBusinessTripTitle("Ріверсайд", "uk")).toBe("Відрядження · Ріверсайд");
  });

  it("derives localized work makeup titles from the compensation duration", () => {
    const values: CalendarEventFormValues = { ...baseValues, eventType: "work_makeup", allDay: false, startTime: "18:00", endTime: "20:00" };
    expect(getWorkMakeupTitle(values, "en", { startDate: "2026-08-28", remainingMinutes: 120 })).toBe("Work makeup for August 28, 2026");
    expect(getWorkMakeupTitle({ ...values, endTime: "19:00" }, "uk", { startDate: "2026-08-28", remainingMinutes: 120 })).toBe("Часткове відпрацювання за 28 серпня 2026 р.");
    expect(getWorkMakeupTitle(values, "en")).toBe("Work makeup");
  });

  it("derives localized site visit titles from the selected project", () => {
    expect(getSiteVisitTitle("Riverside House", "en")).toBe("Site visit · Riverside House");
    expect(getSiteVisitTitle("Будинок на Річковій", "uk")).toBe("Виїзд на об'єкт · Будинок на Річковій");
  });

  it("includes selected invitee IDs in the create-event payload", () => {
    const attendeeIds = ["123e4567-e89b-12d3-a456-426614174001", "123e4567-e89b-12d3-a456-426614174002"];
    expect(toCalendarEventMutationPayload({ ...baseValues, attendeeIds }).attendeeIds).toEqual(attendeeIds);
  });

  it("rejects browser-supplied time-off user IDs", () => {
    expect(timeOffRequestSchema.safeParse({ requestType: "vacation", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, privateNote: "", userId: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(false);
  });

  it("derives canonical time-off presentation rules by request type", () => {
    expect(getTimeOffRequestPresentation("day_off")).toMatchObject({ fieldLabelKey: "reason", placeholderKey: "dayOffReasonPlaceholder", requiresReason: true, supportsPartialDay: true });
    expect(getTimeOffRequestPresentation("other")).toMatchObject({ fieldLabelKey: "reason", requiresReason: true, supportsPartialDay: true });
    expect(getTimeOffRequestPresentation("vacation")).toMatchObject({ fieldLabelKey: "note", requiresReason: false, supportsPartialDay: false });
    expect(getTimeOffRequestPresentation("sick_leave")).toMatchObject({ fieldLabelKey: "note", requiresReason: false, supportsPartialDay: true });
  });

  it("requires a non-whitespace reason only for day-off and other requests", () => {
    const baseRequest = { startDate: "2026-08-28", endDate: "2026-08-28", allDay: false, startTime: "14:00", endTime: "18:00" };
    for (const requestType of ["day_off", "other"] as const) {
      expect(timeOffRequestSchema.safeParse({ ...baseRequest, requestType, privateNote: "" }).success).toBe(false);
      expect(timeOffRequestSchema.safeParse({ ...baseRequest, requestType, privateNote: "   " }).success).toBe(false);
      expect(timeOffRequestSchema.safeParse({ ...baseRequest, requestType, privateNote: "Family commitment" }).success).toBe(true);
    }
    expect(timeOffRequestSchema.safeParse({ ...baseRequest, requestType: "sick_leave", privateNote: "" }).success).toBe(true);
    expect(timeOffRequestSchema.safeParse({ ...baseRequest, requestType: "vacation", allDay: true, startTime: null, endTime: null, privateNote: "" }).success).toBe(true);
  });

  it("rejects partial-day vacation requests before they reach persistence", () => {
    expect(timeOffRequestSchema.safeParse({ requestType: "vacation", startDate: "2026-08-28", endDate: "2026-08-28", allDay: false, startTime: "14:00", endTime: "18:00", privateNote: "" }).success).toBe(false);
  });
});
