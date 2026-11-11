import { getCalendarRange, instantToDateOnly } from "@/lib/calendar";
import type { CalendarItem, CalendarView } from "@/types/calendar";

export function resolveCalendarSelection(requestedView: unknown, requestedDate: unknown, fallbackDate = instantToDateOnly(new Date().toISOString())) {
  const view: CalendarView = requestedView === "month" || requestedView === "week" || requestedView === "agenda" ? requestedView : "week";
  const date = typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : fallbackDate;
  return { view, date };
}

/** One authorized snapshot covers every tab, including a late-month Agenda. */
export function getCalendarWorkspaceRange(anchor: string) {
  const month = getCalendarRange("month", anchor);
  const agenda = getCalendarRange("agenda", anchor);
  return { start: month.start, end: month.end > agenda.end ? month.end : agenda.end };
}

export function getCalendarPendingCount(items: CalendarItem[], range: ReturnType<typeof getCalendarRange>) {
  return items.filter((item) => item.source === "time_off_request_admin" && item.status === "pending" && item.startDate <= range.end && item.endDate >= range.start).length;
}
