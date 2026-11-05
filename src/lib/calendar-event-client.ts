import type { CalendarEventRequest, CalendarEventScheduleRequest } from "./validation/calendar";

/** Shared transport for form submissions and guarded schedule-only updates. */
export async function saveCalendarEvent(eventId: string | undefined, payload: CalendarEventRequest | CalendarEventScheduleRequest) {
  const response = await fetch(eventId ? `/api/calendar/events/${encodeURIComponent(eventId)}` : "/api/calendar/events", {
    method: eventId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result: unknown = await response.json();
  return { response, result };
}
