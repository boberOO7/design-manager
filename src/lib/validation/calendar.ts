import { z } from "zod";
import { CALENDAR_EVENT_TYPES, TIME_OFF_REQUEST_TYPES } from "@/types/calendar";
import { isValidEventRange, isValidTimeOffRange } from "@/lib/calendar";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("").transform((value) => value || null);
const optionalUrl = z.string().trim().max(1000).optional().default("").refine((value) => !value || /^https?:\/\//i.test(value), "Use a complete http(s) URL.").transform((value) => value || null);

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, "Enter an event title.").max(200),
  eventType: z.enum(CALENDAR_EVENT_TYPES),
  projectId: z.string().uuid().nullable().optional().default(null),
  allDay: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  attendeeIds: z.array(z.string().uuid()).max(100).default([]),
  location: optionalText(300),
  meetingUrl: optionalUrl,
  description: optionalText(5000),
}).strict().superRefine((value, context) => {
  if (!isValidEventRange(value.startsAt, value.endsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Event end must be after its start." });
  }
});

export const timeOffRequestSchema = z.object({
  userId: z.string().uuid().optional(),
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
