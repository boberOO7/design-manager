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

export type MonthLayoutSegment = {
  itemId: string;
  segmentId: string;
  item: CalendarItem;
  weekIndex: number;
  startColumn: number;
  endColumn: number;
  columnSpan: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  showLabel: boolean;
  visibleStartDate: string;
  visibleEndDate: string;
};

export const WEEK_PIXELS_PER_MINUTE = 1;
export const WEEK_MIN_EVENT_HEIGHT = 18;
export const MONTH_EVENT_GEOMETRY = {
  horizontalInset: 8,
  barHeight: 20,
  laneGap: 2,
  textPaddingInline: 8,
  verticalPadding: 0,
  borderInlineStartWidth: 2,
  borderRadius: 6,
} as const;
export const MONTH_LANE_HEIGHT = MONTH_EVENT_GEOMETRY.barHeight;
export const MONTH_LANE_GAP = MONTH_EVENT_GEOMETRY.laneGap;

export function getMonthSegmentGeometry(segment: Pick<MonthLayoutSegment, "continuesBefore" | "continuesAfter">) {
  return {
    leftInset: segment.continuesBefore ? 0 : MONTH_EVENT_GEOMETRY.horizontalInset,
    rightInset: segment.continuesAfter ? 0 : MONTH_EVENT_GEOMETRY.horizontalInset,
    height: MONTH_EVENT_GEOMETRY.barHeight,
    textPaddingInline: MONTH_EVENT_GEOMETRY.textPaddingInline,
    verticalPadding: MONTH_EVENT_GEOMETRY.verticalPadding,
    borderInlineStartWidth: MONTH_EVENT_GEOMETRY.borderInlineStartWidth,
    leftRadius: segment.continuesBefore ? 0 : MONTH_EVENT_GEOMETRY.borderRadius,
    rightRadius: segment.continuesAfter ? 0 : MONTH_EVENT_GEOMETRY.borderRadius,
  };
}

export type MonthLaneLayout = { laneCount: number; overlayHeight: number; itemOffset: number };

export function getMonthLaneLayout(segments: MonthLayoutSegment[], maximumLanes = 3): MonthLaneLayout {
  const laneCount = Math.min(maximumLanes, Math.max(0, ...segments.map((segment) => segment.lane + 1)));
  const overlayHeight = laneCount === 0 ? 0 : laneCount * MONTH_LANE_HEIGHT + (laneCount - 1) * MONTH_LANE_GAP;
  return { laneCount, overlayHeight, itemOffset: overlayHeight === 0 ? 8 : overlayHeight + MONTH_LANE_GAP };
}

export function getMonthDateLaneLayout(segments: MonthLayoutSegment[], date: string): MonthLaneLayout {
  const coveringSegments = segments.filter((segment) => segment.visibleStartDate <= date && segment.visibleEndDate >= date);
  const laneCount = Math.max(0, ...coveringSegments.map((segment) => segment.lane + 1));
  const overlayHeight = laneCount === 0 ? 0 : laneCount * MONTH_LANE_HEIGHT + (laneCount - 1) * MONTH_LANE_GAP;
  return { laneCount, overlayHeight, itemOffset: overlayHeight === 0 ? 8 : overlayHeight + MONTH_LANE_GAP };
}

function isMonthAllDayItem(item: CalendarItem): boolean {
  return item.allDay;
}

/** Splits every all-day item into week-local, deterministic grid segments for Month view. */
export function getMonthLayoutSegments(items: CalendarItem[], dates: string[]): MonthLayoutSegment[] {
  if (dates.length !== 42) throw new Error("Month layout requires exactly 42 dates");
  const visibleStart = dates[0];
  const visibleEnd = dates[dates.length - 1];
  if (!visibleStart || !visibleEnd) return [];

  const segments = items
    .filter(isMonthAllDayItem)
    .filter((item) => item.endDate >= visibleStart && item.startDate <= visibleEnd)
    .flatMap((item) => {
      const clippedStart = item.startDate < visibleStart ? visibleStart : item.startDate;
      const clippedEnd = item.endDate > visibleEnd ? visibleEnd : item.endDate;
      const startIndex = dates.indexOf(clippedStart);
      const endIndex = dates.indexOf(clippedEnd);
      if (startIndex < 0 || endIndex < 0) return [];

      const itemSegments: MonthLayoutSegment[] = [];
      for (let weekIndex = Math.floor(startIndex / 7); weekIndex <= Math.floor(endIndex / 7); weekIndex += 1) {
        const weekStartIndex = weekIndex * 7;
        const segmentStartIndex = Math.max(startIndex, weekStartIndex);
        const segmentEndIndex = Math.min(endIndex, weekStartIndex + 6);
        const segmentStart = dates[segmentStartIndex];
        const segmentEnd = dates[segmentEndIndex];
        if (!segmentStart || !segmentEnd) continue;
        itemSegments.push({
          itemId: item.key,
          segmentId: `${item.key}:${weekIndex}:${segmentStart}:${segmentEnd}`,
          item,
          weekIndex,
          startColumn: segmentStartIndex - weekStartIndex + 1,
          endColumn: segmentEndIndex - weekStartIndex + 1,
          columnSpan: segmentEndIndex - segmentStartIndex + 1,
          lane: 0,
          continuesBefore: item.startDate < segmentStart,
          continuesAfter: item.endDate > segmentEnd,
          showLabel: true,
          visibleStartDate: segmentStart,
          visibleEndDate: segmentEnd,
        });
      }
      return itemSegments;
    });

  const byWeek = new Map<number, MonthLayoutSegment[]>();
  for (const segment of segments) byWeek.set(segment.weekIndex, [...(byWeek.get(segment.weekIndex) ?? []), segment]);

  return [...byWeek.entries()].flatMap(([, weekSegments]) => {
    const laneEnds: number[] = [];
    return [...weekSegments]
      .sort((left, right) => left.visibleStartDate.localeCompare(right.visibleStartDate)
        || right.columnSpan - left.columnSpan
        || left.itemId.localeCompare(right.itemId))
      .map((segment) => {
        const lane = laneEnds.findIndex((endColumn) => endColumn < segment.startColumn);
        const assignedLane = lane === -1 ? laneEnds.length : lane;
        laneEnds[assignedLane] = segment.endColumn;
        return { ...segment, lane: assignedLane };
      });
  });
}

export function getWeekAllDaySegments(items: CalendarItem[], dates: string[]): MonthLayoutSegment[] {
  if (dates.length !== 7) throw new Error("Week all-day layout requires exactly 7 dates");
  const visibleStart = dates[0];
  const visibleEnd = dates[dates.length - 1];
  if (!visibleStart || !visibleEnd) return [];

  const segments = items.filter((item) => item.allDay && item.endDate >= visibleStart && item.startDate <= visibleEnd).map((item) => {
    const visibleStartDate = item.startDate < visibleStart ? visibleStart : item.startDate;
    const visibleEndDate = item.endDate > visibleEnd ? visibleEnd : item.endDate;
    const startColumn = dates.indexOf(visibleStartDate) + 1;
    const endColumn = dates.indexOf(visibleEndDate) + 1;
    return {
      itemId: item.key, segmentId: `${item.key}:week:${visibleStartDate}:${visibleEndDate}`, item, weekIndex: 0,
      startColumn, endColumn, columnSpan: endColumn - startColumn + 1, lane: 0,
      continuesBefore: item.startDate < visibleStartDate, continuesAfter: item.endDate > visibleEndDate,
      showLabel: true, visibleStartDate, visibleEndDate,
    };
  });

  const laneEnds: number[] = [];
  return segments.sort((left, right) => left.visibleStartDate.localeCompare(right.visibleStartDate)
    || right.columnSpan - left.columnSpan || left.itemId.localeCompare(right.itemId)).map((segment) => {
    const lane = laneEnds.findIndex((endColumn) => endColumn < segment.startColumn);
    const assignedLane = lane === -1 ? laneEnds.length : lane;
    laneEnds[assignedLane] = segment.endColumn;
    return { ...segment, lane: assignedLane };
  });
}

type KyivDateTime = { date: string; minute: number };

function getKyivDateTime(value: string | Date): KyivDateTime {
  const parts = zonedParts(value instanceof Date ? value : new Date(value));
  return { date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`, minute: parts.hour * 60 + parts.minute };
}

export type TimedWeekSegment = { itemId: string; segmentId: string; item: Extract<CalendarItem, { source: "calendar_event" }>; date: string; startMinute: number; endMinute: number };
export type TimedWeekLayoutSegment = TimedWeekSegment & { column: number; columnCount: number };

export function getTimedWeekSegments(items: CalendarItem[], dates: string[]): TimedWeekSegment[] {
  const visibleDates = new Set(dates);
  return items.flatMap((item) => {
    if (item.source !== "calendar_event" || item.allDay) return [];
    const start = getKyivDateTime(item.startsAt);
    const end = getKyivDateTime(item.endsAt);
    const lastDate = end.minute === 0 ? addCalendarDays(end.date, -1) : end.date;
    const result: TimedWeekSegment[] = [];
    for (let date = start.date; date <= lastDate; date = addCalendarDays(date, 1)) {
      if (!visibleDates.has(date)) continue;
      const startMinute = date === start.date ? start.minute : 0;
      const endMinute = date === end.date ? end.minute : 24 * 60;
      if (endMinute > startMinute) result.push({ itemId: item.key, segmentId: `${item.key}:timed:${date}`, item, date, startMinute, endMinute });
    }
    return result;
  });
}

export function getTimedWeekLayout(segments: TimedWeekSegment[]): TimedWeekLayoutSegment[] {
  const byDate = new Map<string, TimedWeekSegment[]>();
  for (const segment of segments) byDate.set(segment.date, [...(byDate.get(segment.date) ?? []), segment]);
  return [...byDate.values()].flatMap((daySegments) => {
    const ordered = [...daySegments].sort((left, right) => left.startMinute - right.startMinute || (right.endMinute - right.startMinute) - (left.endMinute - left.startMinute) || left.itemId.localeCompare(right.itemId));
    const clusters: TimedWeekSegment[][] = [];
    let cluster: TimedWeekSegment[] = [];
    let clusterEnd = -1;
    for (const segment of ordered) {
      if (cluster.length && segment.startMinute >= clusterEnd) { clusters.push(cluster); cluster = []; clusterEnd = -1; }
      cluster.push(segment); clusterEnd = Math.max(clusterEnd, segment.endMinute);
    }
    if (cluster.length) clusters.push(cluster);
    return clusters.flatMap((group) => {
      const laneEnds: number[] = [];
      const assigned = group.map((segment) => {
        const column = laneEnds.findIndex((endMinute) => endMinute <= segment.startMinute);
        const assignedColumn = column === -1 ? laneEnds.length : column;
        laneEnds[assignedColumn] = segment.endMinute;
        return { segment, column: assignedColumn };
      });
      return assigned.map(({ segment, column }) => ({ ...segment, column, columnCount: laneEnds.length }));
    });
  });
}

export function getTimedEventHeight(startMinute: number, endMinute: number, pixelsPerMinute = WEEK_PIXELS_PER_MINUTE, minimumHeight = WEEK_MIN_EVENT_HEIGHT): number {
  return Math.max(minimumHeight, (endMinute - startMinute) * pixelsPerMinute);
}

export function getInitialWeekScrollTop(pixelsPerMinute = WEEK_PIXELS_PER_MINUTE): number { return 8 * 60 * pixelsPerMinute; }

export function getCurrentWeekTimePosition(dates: string[], now: Date): { dayIndex: number; minute: number } | null {
  const current = getKyivDateTime(now);
  const dayIndex = dates.indexOf(current.date);
  return dayIndex === -1 ? null : { dayIndex, minute: current.minute };
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
