import type { CalendarEventType, CalendarFilters, CalendarItem, CalendarView, TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  events: true,
  projectDeadlines: true,
  taskDeadlines: false,
  timeOff: true,
  projectId: "",
  personId: "",
  mine: false,
};

export const APPLICATION_TIME_ZONE = "Europe/Kyiv";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new Error("Invalid date-only value");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toDateOnly(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function zonedParts(value: Date, timeZone = APPLICATION_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function instantToDateOnly(value: string): string {
  const parts = zonedParts(new Date(value));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatCalendarTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APPLICATION_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatCalendarDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APPLICATION_TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function instantToWallInput(value: string): string {
  const parts = zonedParts(new Date(value));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function zonedWallTimeToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid local date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = zonedParts(new Date(guess));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess = targetUtc - (actualAsUtc - guess);
  }
  return new Date(guess).toISOString();
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function startOfMondayWeek(value: string): string {
  const date = parseDateOnly(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return toDateOnly(date);
}

export function getMonthGrid(value: string): string[] {
  const date = parseDateOnly(value);
  const first = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const start = startOfMondayWeek(first);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
}

export function getCalendarRange(view: CalendarView, anchor: string): { start: string; end: string } {
  if (view === "month") {
    const dates = getMonthGrid(anchor);
    return { start: dates[0], end: dates[dates.length - 1] };
  }
  if (view === "week") {
    const start = startOfMondayWeek(anchor);
    return { start, end: addCalendarDays(start, 6) };
  }
  return { start: anchor, end: addCalendarDays(anchor, 29) };
}

export function itemOccursOn(item: CalendarItem, date: string): boolean {
  return item.startDate <= date && item.endDate >= date;
}

export function calendarItemTimestamp(item: CalendarItem): number {
  if (item.source === "calendar_event" && !item.allDay) return new Date(item.startsAt).getTime();
  return parseDateOnly(item.startDate).getTime();
}

export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((left, right) => {
    const day = left.startDate.localeCompare(right.startDate);
    if (day !== 0) return day;
    if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
    return calendarItemTimestamp(left) - calendarItemTimestamp(right) || left.title.localeCompare(right.title);
  });
}

export function filterCalendarItems(items: CalendarItem[], filters: CalendarFilters, currentUserId: string): CalendarItem[] {
  return sortCalendarItems(items.filter((item) => {
    if (item.source === "calendar_event" && !filters.events) return false;
    if (item.source === "project_deadline" && !filters.projectDeadlines) return false;
    if (item.source === "task_deadline" && !filters.taskDeadlines) return false;
    if ((item.source === "time_off" || item.source === "time_off_request_admin") && !filters.timeOff) return false;
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.personId && !item.personIds.includes(filters.personId)) return false;
    if (filters.mine && !item.personIds.includes(currentUserId)) return false;
    return true;
  }));
}

export function getDayItems(items: CalendarItem[], date: string): CalendarItem[] {
  return sortCalendarItems(items.filter((item) => itemOccursOn(item, date)));
}

export function getVisibleDayItems(items: CalendarItem[], date: string, limit = 3): { visible: CalendarItem[]; overflow: number } {
  const dayItems = getDayItems(items, date);
  return { visible: dayItems.slice(0, limit), overflow: Math.max(0, dayItems.length - limit) };
}

export function mergeCalendarItem(items: CalendarItem[], updated: CalendarItem): CalendarItem[] {
  const map = new Map(items.map((item) => [item.key, item]));
  map.set(updated.key, updated);
  return sortCalendarItems([...map.values()]);
}

export function removeCalendarItem(items: CalendarItem[], key: string): CalendarItem[] {
  return items.filter((item) => item.key !== key);
}

export function deduplicateCalendarItems(items: CalendarItem[]): CalendarItem[] {
  const uniqueItems = new Map<string, CalendarItem>();
  for (const item of items) {
    const identity = item.source === "time_off" || item.source === "time_off_request_admin"
      ? `time_off:${item.id}`
      : item.key;
    const existing = uniqueItems.get(identity);
    if (!existing || (existing.source === "time_off" && item.source === "time_off_request_admin")) {
      uniqueItems.set(identity, item);
    }
  }
  return sortCalendarItems([...uniqueItems.values()]);
}

export function isValidEventRange(startsAt: string, endsAt: string): boolean {
  return Number.isFinite(Date.parse(startsAt)) && Number.isFinite(Date.parse(endsAt)) && Date.parse(endsAt) > Date.parse(startsAt);
}

export function isValidTimeOffRange(input: { startDate: string; endDate: string; allDay: boolean; startTime?: string | null; endTime?: string | null }): boolean {
  if (!DATE_ONLY.test(input.startDate) || !DATE_ONLY.test(input.endDate) || input.endDate < input.startDate) return false;
  if (input.allDay) return !input.startTime && !input.endTime;
  if (input.startDate !== input.endDate || !input.startTime || !input.endTime) return false;
  return input.endTime > input.startTime;
}

export function canTransitionTimeOff(status: TimeOffStatus, next: TimeOffStatus, role: "admin" | "employee"): boolean {
  if (role === "employee") return status === "pending" && next === "cancelled";
  return (status === "pending" && ["approved", "rejected", "cancelled"].includes(next))
    || ((status === "approved" || status === "rejected") && next === "cancelled");
}

export function isCoworkerRequestVisible(status: TimeOffStatus): boolean {
  return status === "approved";
}

export function formatTimeOffAvailabilityTitle(subjectName: string | null | undefined): string {
  const safeName = subjectName?.trim() || "Team member";
  return `${safeName} · Out of office`;
}

export function canAttendCalendarEvent(input: { eventStudioId: string; personStudioId: string; projectId: string | null; eventType: CalendarEventType; personProjectIds: string[] }): boolean {
  if (input.eventStudioId !== input.personStudioId) return false;
  if (input.projectId === null || input.eventType === "meeting" || input.eventType === "client_presentation") return true;
  return input.personProjectIds.includes(input.projectId);
}

export function normalizeCoworkerTimeOff(input: { id: string; userId: string; employeeName: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; allDay: boolean; status: TimeOffStatus }): Extract<CalendarItem, { source: "time_off" }> | null {
  if (!isCoworkerRequestVisible(input.status)) return null;
  const subjectName = input.employeeName.trim() || "Team member";
  return { source: "time_off", key: `time_off:${input.id}`, id: input.id, title: formatTimeOffAvailabilityTitle(subjectName), startDate: input.startDate, endDate: input.endDate, allDay: input.allDay, projectId: null, personIds: [input.userId], subjectUserId: input.userId, subjectName, startTime: input.startTime, endTime: input.endTime };
}

export function normalizePrivateTimeOff(input: { id: string; userId: string; employeeName: string; requestType: TimeOffRequestType; status: TimeOffStatus; startDate: string; endDate: string; startTime: string | null; endTime: string | null; allDay: boolean; privateNote: string | null; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null; currentUserId: string }): Extract<CalendarItem, { source: "time_off_request_admin" }> | null {
  if (input.status === "cancelled") return null;
  const subjectName = input.employeeName.trim() || "Team member";
  const title = input.status === "approved"
    ? formatTimeOffAvailabilityTitle(subjectName)
    : input.status === "pending" ? "Pending request" : "Rejected request";
  return { source: "time_off_request_admin", key: `time_off_request_admin:${input.id}`, id: input.id, title, startDate: input.startDate, endDate: input.endDate, allDay: input.allDay, projectId: null, personIds: [input.userId], subjectUserId: input.userId, subjectName, requestType: input.requestType, status: input.status, startTime: input.startTime, endTime: input.endTime, privateNote: input.privateNote, reviewNote: input.reviewNote, reviewedBy: input.reviewedBy, reviewedAt: input.reviewedAt, isOwn: input.userId === input.currentUserId };
}
