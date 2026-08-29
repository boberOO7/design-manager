import { z } from "zod";
import { CALENDAR_EVENT_TYPES, TIME_OFF_REQUEST_TYPES } from "@/types/calendar";
import { instantToDateOnly, isValidEventRange, isValidTimeOffRange } from "@/lib/calendar";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("").transform((value) => value || null);
const optionalUrl = z.string().trim().max(1000).optional().default("").refine((value) => !value || /^https?:\/\//i.test(value), "Use a complete http(s) URL.").transform((value) => value || null);
const recurrenceRule = z.object({ frequency: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(99), weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]), endsOn: z.iso.date().nullable().default(null), occurrenceCount: z.number().int().min(1).max(999).nullable().default(null) }).strict().nullable().default(null);

const meetingMode = z.enum(["offline", "online"]).nullable().optional();

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, "Enter an event title.").max(200),
  eventType: z.enum(CALENDAR_EVENT_TYPES),
  projectId: z.string().uuid().nullable().optional().default(null),
  allDay: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  attendeeIds: z.array(z.string().uuid()).max(100).default([]),
  participantIds: z.array(z.string().uuid()).max(100).default([]),
  location: optionalText(300),
  meetingUrl: optionalUrl,
  meetingMode,
  description: optionalText(5000),
  recurrenceRule,
  compensatesTimeOffRequestId: z.string().uuid().nullable().optional().default(null),
  assigneeId: z.string().uuid().nullable().optional().default(null),
  occurrenceStart: z.iso.datetime({ offset: true }).optional(),
  scope: z.enum(["this", "series"]).optional(),
}).strict().superRefine((value, context) => {
  if (!isValidEventRange(value.startsAt, value.endsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Event end must be after its start." });
  }
  if (value.compensatesTimeOffRequestId && value.eventType !== "work_makeup") {
    context.addIssue({ code: "custom", path: ["compensatesTimeOffRequestId"], message: "Only work makeup events can compensate time off." });
  }
  if (value.compensatesTimeOffRequestId && value.recurrenceRule) {
    context.addIssue({ code: "custom", path: ["compensatesTimeOffRequestId"], message: "A linked work makeup event cannot repeat." });
  }
  if (value.eventType === "site_visit") {
    if (!value.projectId) context.addIssue({ code: "custom", path: ["projectId"], message: "Choose a project for the site visit." });
    if (!value.assigneeId) context.addIssue({ code: "custom", path: ["assigneeId"], message: "Choose a responsible assignee for the site visit." });
    if (value.allDay) context.addIssue({ code: "custom", path: ["allDay"], message: "Site visits must have a start and end time." });
    if (value.recurrenceRule) context.addIssue({ code: "custom", path: ["recurrenceRule"], message: "Site visits cannot repeat." });
    if (instantToDateOnly(value.startsAt) !== instantToDateOnly(value.endsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "Site visits must start and end on the same local calendar day." });
  }
  if (value.eventType === "meeting" || value.eventType === "client_presentation") {
    const normalizedMeetingMode = value.meetingMode ?? "offline";
    if (value.allDay) context.addIssue({ code: "custom", path: ["allDay"], message: "Meetings and presentations must have a start and end time." });
    if (value.recurrenceRule) context.addIssue({ code: "custom", path: ["recurrenceRule"], message: "Meetings and presentations cannot repeat." });
    if (instantToDateOnly(value.startsAt) !== instantToDateOnly(value.endsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "Meetings and presentations must start and end on the same local calendar day." });
    if (normalizedMeetingMode === "offline" && value.meetingUrl) context.addIssue({ code: "custom", path: ["meetingUrl"], message: "Offline meetings cannot include a meeting link." });
    if (normalizedMeetingMode === "online" && value.location) context.addIssue({ code: "custom", path: ["location"], message: "Online meetings cannot include a location." });
  }
  if (value.eventType === "business_trip") {
    if (!value.projectId) context.addIssue({ code: "custom", path: ["projectId"], message: "Choose a project for the business trip." });
    if (value.recurrenceRule) context.addIssue({ code: "custom", path: ["recurrenceRule"], message: "Business trips cannot repeat." });
    if (value.meetingUrl) context.addIssue({ code: "custom", path: ["meetingUrl"], message: "Business trips cannot include a meeting link." });
  }
}).transform((value) => ({
  ...value,
  meetingMode: value.eventType === "meeting" || value.eventType === "client_presentation"
    ? value.meetingMode ?? "offline"
    : null,
}));

export const timeOffRequestSchema = z.object({
  requestType: z.enum(TIME_OFF_REQUEST_TYPES),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  allDay: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  privateNote: optionalText(2000),
}).strict().superRefine((value, context) => {
  if (!isValidTimeOffRange(value)) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Use a valid date range; partial time off must be within one day and end after it starts." });
  }
});

export const timeOffActionSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  reviewNote: optionalText(2000),
}).strict();

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type TimeOffRequestInput = z.infer<typeof timeOffRequestSchema>;

export function calendarFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

export function getCalendarEventPersistenceError(error: { code?: string; message?: string } | null): { formError: string; fieldErrors?: Record<string, string> } {
  const message = error?.message ?? "";

  if (message.includes("must start and end at Europe/Kyiv") || message.includes("ends_at") || message.includes("Event end")) {
    return { formError: "Choose an end that is after the start.", fieldErrors: { endsAt: "Event end must be after its start." } };
  }
  if (error?.code === "22P02" || message.includes("event_type")) {
    return { formError: "Choose a supported event type.", fieldErrors: { eventType: "Unsupported event type." } };
  }
  if (message.includes("Business trip participant") || message.includes("Business trips require at least one participant")) {
    return { formError: "Choose at least one active project member for the business trip.", fieldErrors: { participantIds: "Choose active project members who are going on the trip." } };
  }
  if (message.includes("Attendee") || message.includes("attendee") || message.includes("Invitee") || message.includes("invitee") || message.includes("project members") || message.includes("active studio member")) {
    return { formError: "One or more attendees are not valid for this event.", fieldErrors: { attendeeIds: "Choose active eligible attendees." } };
  }
  if (message.includes("project") || message.includes("Project") || message.includes("Events on completed or archived")) {
    return { formError: "The selected project is unavailable or cannot receive events.", fieldErrors: { projectId: "Choose an accessible planned, active, or paused project." } };
  }
  return { formError: "The event could not be saved. Please try again." };
}
