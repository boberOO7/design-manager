import { addCalendarDays, WEEK_PIXELS_PER_MINUTE } from "./calendar";
import { createCalendarEventFormValues, updateEventStartTime, type CalendarEventFormRange } from "./calendar-event-form";

const SLOT_MINUTES = 15;
const DAY_MINUTES = 24 * 60;

export function getWeekPointerMinute(offsetY: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, offsetY / WEEK_PIXELS_PER_MINUTE));
}

function snapMinute(minute: number): number {
  return Math.floor(Math.max(0, Math.min(DAY_MINUTES, minute)) / SLOT_MINUTES) * SLOT_MINUTES;
}

export function isWeekSelectionDrag(startX: number, startY: number, x: number, y: number): boolean {
  return Math.hypot(x - startX, y - startY) >= 5;
}

export function getWeekSelectionMinutes(anchorMinute: number, pointerMinute: number) {
  const anchor = Math.min(DAY_MINUTES - SLOT_MINUTES, snapMinute(anchorMinute));
  const pointer = snapMinute(pointerMinute);
  const startMinute = Math.min(anchor, pointer);
  return { startMinute, endMinute: Math.max(startMinute + SLOT_MINUTES, anchor, pointer) };
}

function wallTime(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function getWeekCreationRange(date: string, anchorMinute: number, pointerMinute?: number): CalendarEventFormRange {
  if (pointerMinute === undefined) {
    const startMinute = Math.floor(Math.max(0, Math.min(DAY_MINUTES - 60, anchorMinute)) / 60) * 60;
    const values = updateEventStartTime(createCalendarEventFormValues(undefined, date), wallTime(startMinute), true);
    return { startDate: values.startDate, endDate: values.endDate, startTime: values.startTime, endTime: values.endTime };
  }
  const { startMinute, endMinute } = getWeekSelectionMinutes(anchorMinute, pointerMinute);
  return { startDate: date, endDate: endMinute === DAY_MINUTES ? addCalendarDays(date, 1) : date, startTime: wallTime(startMinute), endTime: wallTime(endMinute) };
}
