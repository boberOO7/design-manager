import { addCalendarDays, instantToDateOnly, instantToWallInput, zonedWallTimeToIso } from "./calendar";
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
};

const MINUTES_PER_DAY = 24 * 60;

function keepTimedRangeValid(values: CalendarEventFormValues): CalendarEventFormValues {
  if (values.allDay || values.endDate > values.startDate || values.endTime > values.startTime) return values;
  return { ...values, endDate: addCalendarDays(values.startDate, 1) };
}

function getCalendarDateDifference(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / (1000 * 60 * 60 * 24);
}

function getTimeInMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function addWallMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const totalMinutes = getTimeInMinutes(time) + minutes;
  const dateOffset = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const timeInDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = String(Math.floor(timeInDay / 60)).padStart(2, "0");
  const minute = String(timeInDay % 60).padStart(2, "0");
  return { date: addCalendarDays(date, dateOffset), time: `${hour}:${minute}` };
}

function getTimedDurationInMinutes(values: CalendarEventFormValues): number {
  const duration = getCalendarDateDifference(values.startDate, values.endDate) * MINUTES_PER_DAY + getTimeInMinutes(values.endTime) - getTimeInMinutes(values.startTime);
  return duration > 0 ? duration : 60;
}

/**
 * Keeps a same-day end date coupled to the start date until the user chooses a
 * distinct end date. A manual end date remains intact unless it would precede
 * the new start date.
 */
export function updateEventStartDate(values: CalendarEventFormValues, startDate: string, endDateLinked: boolean): CalendarEventFormValues {
  const endDate = endDateLinked || values.endDate < startDate ? startDate : values.endDate;
  return keepTimedRangeValid({ ...values, startDate, endDate });
}

/**
 * Keeps the end time coupled to the start time until the user edits it. Linked
 * ranges preserve their wall-clock duration, including an overnight rollover.
 */
export function updateEventStartTime(values: CalendarEventFormValues, startTime: string, endTimeLinked: boolean): CalendarEventFormValues {
  if (values.allDay) return { ...values, startTime };

  if (endTimeLinked) {
    const end = addWallMinutes(values.startDate, startTime, getTimedDurationInMinutes(values));
    return { ...values, startTime, endDate: end.date, endTime: end.time };
  }

  const next = { ...values, startTime };
  if (next.endDate > next.startDate || next.endTime > next.startTime) return next;

  const end = addWallMinutes(next.startDate, startTime, 60);
  return { ...next, endDate: end.date, endTime: end.time };
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
  };
}
