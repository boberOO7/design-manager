import { addCalendarDays, instantToDateOnly, instantToWallInput, parseDateOnly, zonedWallTimeToIso } from "./calendar";
import { updateLinkedStartDate, updateLinkedStartTime } from "./calendar-form-range";
import { getWorkMakeupMinutes } from "./time-off-compensation";
import type { CalendarEventType, CalendarItem } from "../types/calendar";
import type { RecurrenceRule } from "./calendar-recurrence";

export type CalendarEventFormValues = {
  title: string;
  eventType: CalendarEventType;
  projectId: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  attendeeIds: string[];
  location: string;
  meetingUrl: string;
  description: string;
  recurrenceRule?: RecurrenceRule | null;
  compensatesTimeOffRequestId?: string;
};

export function updateEventStartDate(values: CalendarEventFormValues, startDate: string, endDateLinked: boolean): CalendarEventFormValues {
  return { ...values, ...updateLinkedStartDate(values, startDate, endDateLinked) };
}

export function updateEventStartTime(values: CalendarEventFormValues, startTime: string, endTimeLinked: boolean): CalendarEventFormValues {
  return { ...values, ...updateLinkedStartTime(values, startTime, endTimeLinked) };
}

function splitWallDateTime(value: string): { date: string; time: string } {
  const [date, time] = value.split("T");
  if (!date || !time) throw new Error("Invalid local date and time");
  return { date, time };
}

export function getAllDayEventBounds(startDate: string, endDate: string): { startsAt: string; endsAt: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    throw new Error("Invalid all-day date range");
  }

  return {
    startsAt: zonedWallTimeToIso(`${startDate}T00:00`),
    endsAt: zonedWallTimeToIso(`${addCalendarDays(endDate, 1)}T00:00`),
  };
}

export function getInclusiveAllDayEndDate(endsAt: string): string {
  return addCalendarDays(instantToDateOnly(endsAt), -1);
}

export function createCalendarEventFormValues(
  item: Extract<CalendarItem, { source: "calendar_event" }> | undefined,
  baseDate: string,
): CalendarEventFormValues {
  const start = item ? splitWallDateTime(instantToWallInput(item.startsAt)) : { date: baseDate, time: "09:00" };
  const end = item ? splitWallDateTime(instantToWallInput(item.endsAt)) : { date: baseDate, time: "10:00" };

  return {
    title: item?.title ?? "",
    eventType: item?.eventType ?? "meeting",
    projectId: item?.projectId ?? "",
    allDay: item?.allDay ?? false,
    startDate: item?.allDay ? item.startDate : start.date,
    endDate: item?.allDay ? item.endDate : end.date,
    startTime: start.time,
    endTime: end.time,
    attendeeIds: item?.invitees.map((person) => person.id) ?? [],
    location: item?.location ?? "",
    meetingUrl: item?.meetingUrl ?? "",
    description: item?.description ?? "",
    recurrenceRule: item?.recurrenceRule ?? null,
    compensatesTimeOffRequestId: item?.compensatesTimeOffRequestId ?? "",
  };
}

export function toCalendarEventMutationPayload(values: CalendarEventFormValues) {
  const bounds = values.allDay
    ? getAllDayEventBounds(values.startDate, values.endDate)
    : {
      startsAt: zonedWallTimeToIso(`${values.startDate}T${values.startTime}`),
      endsAt: zonedWallTimeToIso(`${values.endDate}T${values.endTime}`),
    };

  return {
    title: values.title,
    eventType: values.eventType,
    projectId: values.projectId || null,
    allDay: values.allDay,
    ...bounds,
    attendeeIds: values.attendeeIds,
    location: values.location,
    meetingUrl: values.meetingUrl,
    description: values.description,
    recurrenceRule: values.recurrenceRule ?? null,
    compensatesTimeOffRequestId: values.compensatesTimeOffRequestId || null,
  };
}

export function getWorkMakeupTitle(
  values: CalendarEventFormValues,
  locale: string,
  dayOff?: { startDate: string; remainingMinutes: number; previousContributionMinutes?: number } | null,
): string {
  if (!dayOff) return locale.startsWith("uk") ? "Відпрацювання" : "Work makeup";

  const payload = toCalendarEventMutationPayload(values);
  const compensatedMinutes = getWorkMakeupMinutes({ startsAt: payload.startsAt, endsAt: payload.endsAt, allDay: payload.allDay });
  const remainingMinutes = dayOff.remainingMinutes + (dayOff.previousContributionMinutes ?? 0);
  const partial = compensatedMinutes < remainingMinutes;
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(parseDateOnly(dayOff.startDate));

  if (locale.startsWith("uk")) return `${partial ? "Часткове відпрацювання" : "Відпрацювання"} за ${date}`;
  return `${partial ? "Partial work makeup" : "Work makeup"} for ${date}`;
}
