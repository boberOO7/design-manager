import type { CalendarCoreData, CalendarItem } from "@/types/calendar";
import { addCalendarDays, formatCalendarClockTime, getTimedWeekLayout, instantToWallInput, zonedWallTimeToIso, type TimedWeekLayoutSegment, type TimedWeekSegment } from "./calendar";
import { createCalendarEventFormValues, toCalendarEventMutationPayload } from "./calendar-event-form";
import { calendarEventSchema, type CalendarEventRequest } from "./validation/calendar";

type Event = Extract<CalendarItem, { source: "calendar_event" }>;
export type WeekEventBounds = Pick<Event, "startsAt" | "endsAt">;
export type WeekEventEditMode = "move" | "resize";

export type WeekEventPreview = {
  item: Event;
  original: Event;
  valid: boolean;
  mode: WeekEventEditMode;
  sourceDate: string;
  targetDate: string;
  deltaMinutes: number;
};

export function canEditWeekEvent(item: CalendarItem, access: Pick<CalendarCoreData, "currentUserId" | "isAdmin">): item is Event {
  return item.source === "calendar_event" && !item.allDay
    && (access.isAdmin || item.organizer.id === access.currentUserId)
    && (item.eventType === "general" || item.eventType === "meeting" || item.eventType === "presentation" || item.eventType === "site_visit" || (item.eventType === "interview" && access.isAdmin))
    && !item.recurrenceRule && !item.occurrenceStart && !item.seriesId && !item.compensatesTimeOffRequestId;
}

function wallParts(instant: string, timeZone: string) {
  const [date, time] = instantToWallInput(instant, timeZone).split("T");
  const [hour, minute] = time.split(":").map(Number);
  return { date, minute: hour * 60 + minute };
}

function dayMinutes(from: string, to: string) {
  return (Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 60_000;
}

/** Continuous visual geometry; labels and persistence use the snapped item. */
export function getWeekEventPreviewSegments(preview: WeekEventPreview, dates: string[], timeZone: string): TimedWeekSegment[] {
  if (!dates.length) return [];
  const start = wallParts(preview.item.startsAt, timeZone);
  const end = wallParts(preview.item.endsAt, timeZone);
  const original = wallParts(preview.mode === "move" ? preview.original.startsAt : preview.original.endsAt, timeZone);
  let startMinute = dayMinutes(dates[0], start.date) + start.minute;
  let endMinute = dayMinutes(dates[0], end.date) + end.minute;
  const pointerAnchor = dayMinutes(dates[0], original.date) + original.minute + preview.deltaMinutes;
  if (preview.valid && preview.mode === "move") {
    const offset = pointerAnchor + dayMinutes(preview.sourceDate, preview.targetDate) - startMinute;
    startMinute += offset;
    endMinute += offset;
  } else if (preview.valid) {
    endMinute = Math.max(startMinute + 15, pointerAnchor);
  }
  return dates.flatMap((date) => {
    const offset = dayMinutes(dates[0], date);
    const start = Math.max(0, startMinute - offset);
    const end = Math.min(1440, endMinute - offset);
    return end > start ? [{ itemId: preview.item.key, segmentId: `${preview.item.key}:timed:${date}`, item: preview.item, date, startMinute: start, endMinute: end }] : [];
  });
}

/** Keep the grabbed column while moving; all neighbors share the same collision layout. */
export function getWeekEventEditLayout(segments: TimedWeekLayoutSegment[], replacement: TimedWeekSegment[], itemId: string, sourceDate: string): TimedWeekLayoutSegment[] {
  const columns = new Map(segments.map((segment) => [segment.segmentId, segment.column]));
  const grabbedColumn = segments.find((segment) => segment.itemId === itemId && segment.date === sourceDate)?.column ?? 0;
  for (const segment of replacement) columns.set(segment.segmentId, grabbedColumn);
  return getTimedWeekLayout([...segments.filter((segment) => segment.itemId !== itemId), ...replacement], { columns, activeItemId: itemId });
}

function atMinute(date: string, minute: number, timeZone: string) {
  const day = addCalendarDays(date, Math.floor(minute / 1440));
  const clock = ((minute % 1440) + 1440) % 1440;
  return zonedWallTimeToIso(`${day}T${formatCalendarClockTime(Math.floor(clock / 60), clock % 60)}`, timeZone);
}

/** Always calculate from the original instants, never from the preceding preview. */
export function getWeekEventBounds(item: Event, mode: WeekEventEditMode, sourceDate: string, targetDate: string, deltaMinutes: number, timeZone: string): WeekEventBounds | null {
  try {
    if (mode === "move") {
      const start = wallParts(item.startsAt, timeZone);
      const dayOffset = Math.round((Date.parse(`${targetDate}T00:00Z`) - Date.parse(`${sourceDate}T00:00Z`)) / 86_400_000);
      const startsAt = atMinute(addCalendarDays(start.date, dayOffset), Math.round((start.minute + deltaMinutes) / 15) * 15, timeZone);
      const duration = Date.parse(item.endsAt) - Date.parse(item.startsAt);
      return { startsAt, endsAt: new Date(Date.parse(startsAt) + duration).toISOString() };
    }
    if (sourceDate !== targetDate) return null;
    const end = wallParts(item.endsAt, timeZone);
    let endsAt = atMinute(end.date, Math.round((end.minute + deltaMinutes) / 15) * 15, timeZone);
    if (Date.parse(endsAt) - Date.parse(item.startsAt) < 15 * 60_000) {
      const minimum = wallParts(new Date(Date.parse(item.startsAt) + 15 * 60_000).toISOString(), timeZone);
      endsAt = atMinute(minimum.date, Math.ceil(minimum.minute / 15) * 15, timeZone);
    }
    return Date.parse(endsAt) - Date.parse(item.startsAt) >= 15 * 60_000 ? { startsAt: item.startsAt, endsAt } : null;
  } catch {
    // Nonexistent local times (DST gaps) are invalid drop targets.
    return null;
  }
}

export function getWeekEventUpdate(item: Event, bounds: WeekEventBounds, timeZone: string) {
  const payload: CalendarEventRequest = {
    ...toCalendarEventMutationPayload(createCalendarEventFormValues(item, item.startDate, timeZone), timeZone),
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
    meetingMode: item.meetingMode,
    scope: "series",
  };
  const parsed = calendarEventSchema.safeParse(payload);
  return parsed.success ? payload : null;
}

export function weekEventBoundsChanged(item: Event, bounds: WeekEventBounds): boolean {
  return Date.parse(item.startsAt) !== Date.parse(bounds.startsAt) || Date.parse(item.endsAt) !== Date.parse(bounds.endsAt);
}
