import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_FILTERS, canAttendCalendarEvent, canTransitionTimeOff, deduplicateCalendarItems,
  filterCalendarItems, getDayItems, getMonthGrid, getVisibleDayItems, instantToDateOnly,
  isValidEventRange, isValidTimeOffRange, itemOccursOn, mergeCalendarItem,
  getCurrentWeekTimePosition, getInitialWeekScrollTop, getMonthDateLaneLayout, getMonthItemGeometry, getMonthItemTop, getMonthLaneLayout, getMonthLayoutSegments, getMonthMobileDayItems, getMonthSegmentGeometry,
  getTimedEventHeight, getTimedWeekLayout, getTimedWeekSegments, getWeekAllDaySegments,
  MONTH_EVENT_GEOMETRY, getCalendarItemDisplayTitle, normalizeCalendarTime, normalizeCoworkerTimeOff, normalizePrivateTimeOff, sortCalendarItems,
} from "./calendar";
import type { CalendarItem } from "@/types/calendar";

function birthday(): Extract<CalendarItem, { source: "birthday" }> {
  return { source: "birthday", key: "birthday:u1:2026", id: "birthday:u1:2026", title: "Avery", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: null, personIds: ["u1"], member: { userId: "u1", fullName: "Avery", avatarUrl: null } };
}

function anniversary(): Extract<CalendarItem, { source: "team_anniversary" }> {
  return { source: "team_anniversary", key: "anniversary:m1:2026", id: "anniversary:m1:2026", title: "Taylor", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: null, personIds: ["u2"], member: { userId: "u2", fullName: "Taylor", avatarUrl: null }, anniversaryYears: 2 };
}

function salaryPayment(): Extract<CalendarItem, { source: "salary_payment" }> {
  return { source: "salary_payment", key: "salary-payment:m1:2026-07", id: "salary-payment:m1:2026-07", title: "Taylor", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: null, personIds: ["u2"], member: { userId: "u2", fullName: "Taylor", avatarUrl: null } };
}

function deadline(overrides: Partial<Extract<CalendarItem, { source: "project_deadline" }>> = {}): Extract<CalendarItem, { source: "project_deadline" }> {
  return { source: "project_deadline", key: "project_deadline:p1", id: "p1", title: "Project", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: "p1", personIds: ["u1"], project: { id: "p1", name: "Project", clientName: null, status: "active" }, ...overrides };
}
function task(overrides: Partial<Extract<CalendarItem, { source: "task_deadline" }>> = {}): Extract<CalendarItem, { source: "task_deadline" }> {
  return { source: "task_deadline", key: "task_deadline:t1", id: "t1", title: "Task", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: "p1", personIds: ["u2"], task: { id: "t1", projectId: "p1", projectName: "Project", description: null, status: "todo", priority: "normal", assigneeId: "u2", assigneeName: "Taylor" }, ...overrides };
}

function absence(id: string, userId: string, startDate: string, endDate: string): Extract<CalendarItem, { source: "time_off" }> {
  const item = normalizeCoworkerTimeOff({ id, userId, employeeName: userId, startDate, endDate, startTime: null, endTime: null, allDay: true, status: "approved" });
  if (!item) throw new Error("Expected approved absence");
  return item;
}

function allDayEvent(startDate: string, endDate: string): Extract<CalendarItem, { source: "calendar_event" }> {
  return { source: "calendar_event", key: "calendar_event:e1", id: "e1", title: "Studio event", startDate, endDate, allDay: true, projectId: null, personIds: ["u1"], eventType: "other", startsAt: `${startDate}T00:00:00.000Z`, endsAt: "2026-08-01T00:00:00.000Z", description: null, location: null, meetingUrl: null, meetingMode: null, project: null, organizer: { id: "u1", full_name: "Organizer", job_title: "administrator", avatar_url: null, projectIds: [] }, invitees: [], participants: [] };
}

function timedEvent(id: string, startsAt: string, endsAt: string): Extract<CalendarItem, { source: "calendar_event" }> {
  return { source: "calendar_event", key: `calendar_event:${id}`, id, title: id, startDate: instantToDateOnly(startsAt), endDate: instantToDateOnly(endsAt), allDay: false, projectId: null, personIds: ["u1"], eventType: "other", startsAt, endsAt, description: null, location: null, meetingUrl: null, meetingMode: null, project: null, organizer: { id: "u1", full_name: "Organizer", job_title: "administrator", avatar_url: null, projectIds: [] }, invitees: [], participants: [] };
}

function timedAbsence(id: string, startDate: string, startTime: string, endTime: string): Extract<CalendarItem, { source: "time_off" }> {
  const item = normalizeCoworkerTimeOff({ id, userId: "u2", employeeName: "Vasilios Genshin", startDate, endDate: startDate, startTime, endTime, allDay: false, status: "approved" });
  if (!item) throw new Error("Expected approved timed absence");
  return item;
}

const rawPartialTimeOff = { id: "medical-appointment", userId: "u2", employeeName: "Vasilios Genshin", startDate: "2026-08-12", endDate: "2026-08-12", startTime: "09:00:00", endTime: "12:00:00", allDay: false };

describe("Calendar dates and views", () => {
  it("starts a six-week Month grid on Monday and includes adjacent dates", () => {
    const grid = getMonthGrid("2026-08-15");
    expect(grid).toHaveLength(42); expect(grid[0]).toBe("2026-07-27"); expect(grid.at(-1)).toBe("2026-09-06");
  });
  it("keeps date-only deadlines on their literal day", () => {
    expect(deadline({ startDate: "2026-01-01" }).startDate).toBe("2026-01-01");
    expect(instantToDateOnly("2026-07-27T22:30:00.000Z")).toBe("2026-07-28");
  });
  it("orders Month, Week, and Agenda source items chronologically", () => {
    const ordered = sortCalendarItems([task({ key: "task_deadline:late", startDate: "2026-07-30", endDate: "2026-07-30" }), deadline({ startDate: "2026-07-27", endDate: "2026-07-27" })]);
    expect(ordered.map((item) => item.startDate)).toEqual(["2026-07-27", "2026-07-30"]);
    expect(getDayItems(ordered, "2026-07-30").map((item) => item.key)).toEqual(["task_deadline:late"]);
  });
  it("includes a multi-day absence on each covered date", () => {
    const absence = normalizeCoworkerTimeOff({ id: "r1", userId: "u2", employeeName: "Taylor", startDate: "2026-07-28", endDate: "2026-07-30", startTime: null, endTime: null, allDay: true, status: "approved" });
    expect(absence && itemOccursOn(absence, "2026-07-29")).toBe(true); expect(absence && itemOccursOn(absence, "2026-07-31")).toBe(false);
  });
  it("limits Month cells to three items and reports overflow", () => {
    const items = Array.from({ length: 5 }, (_, index) => deadline({ id: `p${index}`, key: `project_deadline:p${index}` }));
    expect(getVisibleDayItems(items, "2026-07-28")).toMatchObject({ visible: expect.any(Array), overflow: 2 });
  });
});

describe("Calendar SSR-safe item projections", () => {
  const date = "2026-07-28";
  const mixedItems: CalendarItem[] = [
    absence("time-off", "Vasilios Liakhovskyi", date, date),
    { ...allDayEvent(date, date), title: "вф", eventType: "site_visit" },
    deadline({ id: "equal", key: "project_deadline:equal", title: "Another item" }),
  ];

  it("does not mutate the initial snapshot and gives equal keys a canonical total order", () => {
    const originalOrder = mixedItems.map((item) => item.key);
    const first = sortCalendarItems(mixedItems);
    const second = sortCalendarItems([...mixedItems].reverse());
    expect(mixedItems.map((item) => item.key)).toEqual(originalOrder);
    expect(first.map((item) => item.key)).toEqual(["calendar_event:e1", "project_deadline:equal", "time_off:time-off"]);
    expect(second.map((item) => item.key)).toEqual(first.map((item) => item.key));
  });

  it("produces the same item identities and labels for server and client initial projections", () => {
    const serverProjection = getDayItems(mixedItems, date);
    const clientProjection = getDayItems(mixedItems, date);
    expect(clientProjection.map((item) => [item.key, item.title])).toEqual(serverProjection.map((item) => [item.key, item.title]));
  });

  it("keeps Month mobile and desktop projections isolated while preserving lanes and overflow", () => {
    const dates = getMonthGrid("2026-07-15");
    const desktopSegments = getMonthLayoutSegments(mixedItems, dates);
    const mobileProjection = getMonthMobileDayItems(mixedItems, desktopSegments, date, 2);
    const repeatedDesktopSegments = getMonthLayoutSegments(mixedItems, dates);
    const repeatedMobileProjection = getMonthMobileDayItems(mixedItems, repeatedDesktopSegments, date, 2);
    expect(desktopSegments.map((segment) => [segment.segmentId, segment.lane])).toEqual(repeatedDesktopSegments.map((segment) => [segment.segmentId, segment.lane]));
    expect(mobileProjection.visible.map((item) => item.key)).toEqual(repeatedMobileProjection.visible.map((item) => item.key));
    expect(mobileProjection.overflow).toBe(1);
  });
});

describe("Month spanning layout", () => {
  const dates = getMonthGrid("2026-08-15");

  it("creates one five-column segment for a same-week absence and keeps its generic privacy-safe label", () => {
    const item = absence("r1", "Taylor", "2026-07-27", "2026-07-31");
    const segments = getMonthLayoutSegments([item], dates);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ itemId: item.key, weekIndex: 0, startColumn: 1, endColumn: 5, columnSpan: 5, showLabel: true });
    expect(segments[0]?.item.title).toBe("Taylor");
    expect(segments[0]?.item.title).not.toContain("vacation");
  });

  it("splits only at week boundaries and preserves a source item for every clickable segment", () => {
    const item = absence("r1", "Taylor", "2026-07-31", "2026-08-04");
    const segments = getMonthLayoutSegments([item], dates);
    expect(segments.map((segment) => [segment.weekIndex, segment.startColumn, segment.endColumn])).toEqual([[0, 5, 7], [1, 1, 2]]);
    expect(new Set(segments.map((segment) => segment.item))).toEqual(new Set([item]));
  });

  it("clips ranges at both visible grid edges without inventing dates", () => {
    const before = absence("before", "Avery", "2026-07-20", "2026-07-29");
    const after = absence("after", "Morgan", "2026-09-03", "2026-09-10");
    const segments = getMonthLayoutSegments([before, after], dates);
    expect(segments.find((segment) => segment.itemId === before.key)).toMatchObject({ visibleStartDate: "2026-07-27", continuesBefore: true });
    expect(segments.find((segment) => segment.itemId === after.key)).toMatchObject({ visibleEndDate: "2026-09-06", continuesAfter: true });
  });

  it("renders a single-day all-day item as a one-column Month segment and honors inclusive normalized date ranges", () => {
    expect(getMonthLayoutSegments([absence("single", "Avery", "2026-07-28", "2026-07-28")], dates)[0]).toMatchObject({ startColumn: 2, endColumn: 2, columnSpan: 1 });
    expect(getMonthLayoutSegments([absence("inclusive", "Avery", "2026-07-28", "2026-07-29")], dates)[0]).toMatchObject({ columnSpan: 2, visibleEndDate: "2026-07-29" });
  });

  it("uses one shared geometry contract for events, time off, and deadlines", () => {
    const [single] = getMonthLayoutSegments([absence("single", "Avery", "2026-07-28", "2026-07-28")], dates);
    const [spanning] = getMonthLayoutSegments([absence("spanning", "Taylor", "2026-07-28", "2026-07-30")], dates);
    const request = normalizePrivateTimeOff({ id: "request", userId: "u3", employeeName: "Morgan", requestType: "vacation", status: "approved", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true, privateNote: null, reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "u3" });
    if (!request) throw new Error("Expected approved time off request");
    const categorySegments = getMonthLayoutSegments([
      allDayEvent("2026-07-28", "2026-07-28"),
      absence("time-off", "Avery", "2026-07-28", "2026-07-28"),
      request,
      deadline(),
      task(),
    ], dates);
    expect(single).toMatchObject({ startColumn: spanning?.startColumn, columnSpan: 1 });
    expect(MONTH_EVENT_GEOMETRY).toEqual({ cellPaddingBlockStart: 8, dateHeaderHeight: 28, headerClearance: 8, horizontalInset: 8, barHeight: 20, laneGap: 2, textPaddingInline: 8, verticalPadding: 0, borderInlineStartWidth: 2, borderRadius: 6 });
    expect(MONTH_EVENT_GEOMETRY.barHeight + MONTH_EVENT_GEOMETRY.laneGap).toBe(22);
    expect(spanning?.endColumn).toBe(4);
    if (!single || !spanning) throw new Error("Expected Month segments");
    expect(getMonthItemGeometry()).toEqual(getMonthSegmentGeometry(single));
    expect(getMonthSegmentGeometry(single)).toMatchObject({ leftInset: 8, rightInset: 8, height: 20, textPaddingInline: 8, verticalPadding: 0, borderInlineStartWidth: 2 });
    expect(getMonthSegmentGeometry(spanning)).toMatchObject({ leftInset: 8, rightInset: 8, height: 20, textPaddingInline: 8, verticalPadding: 0, borderInlineStartWidth: 2 });
    expect(categorySegments.map(getMonthSegmentGeometry)).toEqual(Array.from({ length: 5 }, () => expect.objectContaining({ height: MONTH_EVENT_GEOMETRY.barHeight, textPaddingInline: MONTH_EVENT_GEOMETRY.textPaddingInline, borderInlineStartWidth: MONTH_EVENT_GEOMETRY.borderInlineStartWidth })));
  });

  it("uses the same header-clearance origin before all Month lanes and after their overlays", () => {
    const headerBottom = MONTH_EVENT_GEOMETRY.cellPaddingBlockStart + MONTH_EVENT_GEOMETRY.dateHeaderHeight;
    expect(getMonthItemTop()).toBe(headerBottom + MONTH_EVENT_GEOMETRY.headerClearance);
    expect(getMonthItemTop(MONTH_EVENT_GEOMETRY.barHeight)).toBe(getMonthItemTop() + MONTH_EVENT_GEOMETRY.barHeight + MONTH_EVENT_GEOMETRY.headerClearance);
    expect(getMonthItemTop(MONTH_EVENT_GEOMETRY.barHeight * 3 + MONTH_EVENT_GEOMETRY.laneGap * 2)).toBe(116);
  });

  it("keeps continuation boundaries gapless and leaves timed events out of Month all-day segments", () => {
    const segments = getMonthLayoutSegments([absence("continued", "Avery", "2026-07-31", "2026-08-04")], dates);
    expect(segments.map((segment) => [segment.startColumn, segment.endColumn, segment.continuesBefore, segment.continuesAfter])).toEqual([[5, 7, false, true], [1, 2, true, false]]);
    expect(segments.map(getMonthSegmentGeometry)).toMatchObject([{ leftInset: 8, rightInset: 0 }, { leftInset: 0, rightInset: 8 }]);
    expect(getMonthLayoutSegments([timedEvent("timed", "2026-07-28T06:00:00.000Z", "2026-07-28T07:00:00.000Z")], dates)).toEqual([]);
  });

  it("does not add the exclusive all-day event end date and keeps DST ranges as calendar dates", () => {
    expect(getMonthLayoutSegments([allDayEvent("2026-07-30", "2026-07-31")], dates)[0]).toMatchObject({ columnSpan: 2, visibleEndDate: "2026-07-31" });
    const dstDates = getMonthGrid("2026-03-15");
    expect(getMonthLayoutSegments([absence("dst", "Avery", "2026-03-27", "2026-03-30")], dstDates)[0]).toMatchObject({ visibleStartDate: "2026-03-27", visibleEndDate: "2026-03-29", continuesAfter: true });
  });

  it("allocates deterministic week-local lanes, separating overlaps and reusing non-overlapping lanes", () => {
    const first = absence("a", "Avery", "2026-07-27", "2026-07-29");
    const overlap = absence("b", "Taylor", "2026-07-28", "2026-07-30");
    const later = absence("c", "Morgan", "2026-07-30", "2026-07-31");
    const ordered = getMonthLayoutSegments([first, overlap, later], dates);
    const reversed = getMonthLayoutSegments([later, overlap, first], dates);
    expect(ordered.map((segment) => [segment.itemId, segment.lane]).sort()).toEqual(reversed.map((segment) => [segment.itemId, segment.lane]).sort());
    expect(ordered.find((segment) => segment.itemId === first.key)?.lane).not.toBe(ordered.find((segment) => segment.itemId === overlap.key)?.lane);
    expect(ordered.find((segment) => segment.itemId === later.key)?.lane).toBe(ordered.find((segment) => segment.itemId === first.key)?.lane);
  });

  it("reserves compact Month overlay space only for lanes that are actually used", () => {
    expect(getMonthLaneLayout([])).toMatchObject({ laneCount: 0, overlayHeight: 0, itemOffset: 8 });
    const oneLane = getMonthLayoutSegments([absence("one", "Avery", "2026-07-27", "2026-07-29")], dates);
    expect(getMonthLaneLayout(oneLane)).toMatchObject({ laneCount: 1, overlayHeight: 20, itemOffset: 36 });
    const threeLanes = getMonthLayoutSegments([
      absence("a", "Avery", "2026-07-27", "2026-07-31"), absence("b", "Taylor", "2026-07-27", "2026-07-31"), absence("c", "Morgan", "2026-07-27", "2026-07-31"),
    ], dates);
    expect(getMonthLaneLayout(threeLanes)).toMatchObject({ laneCount: 3, overlayHeight: 64 });
  });

  it("reserves Month lane space per date instead of using the week's maximum", () => {
    const longAbsence = absence("long", "Avery", "2026-07-29", "2026-08-02");
    const augFirstAbsence = absence("later", "Taylor", "2026-08-01", "2026-08-01");
    const segments = getMonthLayoutSegments([longAbsence, augFirstAbsence], dates).filter((segment) => segment.weekIndex === 0);
    expect(segments.map((segment) => [segment.itemId, segment.lane])).toEqual([[longAbsence.key, 0], [augFirstAbsence.key, 1]]);
    expect(getMonthLaneLayout(segments)).toMatchObject({ laneCount: 2, itemOffset: 58 });
    expect(getMonthDateLaneLayout(segments, "2026-07-29")).toMatchObject({ laneCount: 1, itemOffset: 36 });
    expect(getMonthDateLaneLayout(segments, "2026-08-01")).toMatchObject({ laneCount: 2, itemOffset: 58 });
    expect(getMonthDateLaneLayout(segments, "2026-07-28")).toMatchObject({ laneCount: 0, itemOffset: 8 });
  });

  it("does not reserve a hidden lane outside the date it covers", () => {
    const first = absence("first", "Avery", "2026-07-29", "2026-08-02");
    const hidden = absence("hidden", "Taylor", "2026-08-01", "2026-08-01");
    const segments = getMonthLayoutSegments([first, hidden], dates).filter((segment) => segment.weekIndex === 0);
    expect(getMonthDateLaneLayout(segments, "2026-07-30")).toMatchObject({ laneCount: 1, itemOffset: 36 });
    expect(getMonthDateLaneLayout(segments, "2026-08-01")).toMatchObject({ laneCount: 2, itemOffset: 58 });
  });
});

describe("Hourly Week layout", () => {
  const dates = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];

  it("positions timed events by Kyiv-local minute and sizes duration proportionally", () => {
    const event = timedEvent("morning", "2026-07-27T06:00:00.000Z", "2026-07-27T07:30:00.000Z");
    const [segment] = getTimedWeekSegments([event], dates);
    expect(segment).toMatchObject({ date: "2026-07-27", startMinute: 540, endMinute: 630 });
    expect(getTimedEventHeight(540, 630)).toBe(90);
    expect(getTimedEventHeight(540, 545)).toBe(18);
  });

  it("projects partial-day time off into the timed Week layout with its local date and duration", () => {
    const timeOff = normalizeCoworkerTimeOff({ ...rawPartialTimeOff, status: "approved" });
    if (!timeOff) throw new Error("Expected approved timed absence");
    const week = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];
    const [segment] = getTimedWeekSegments([timeOff], week);

    expect(segment).toMatchObject({ itemId: timeOff.key, item: timeOff, date: "2026-08-12", startMinute: 540, endMinute: 720 });
    expect(getTimedEventHeight(segment?.startMinute ?? 0, segment?.endMinute ?? 0)).toBe(180);
    expect(getWeekAllDaySegments([timeOff], week)).toEqual([]);
  });

  it("preserves a partial-day time-off identity across Calendar projections and its category filter", () => {
    const timeOff = timedAbsence("medical", "2026-08-12", "09:00", "12:00");
    const week = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];

    expect(getDayItems([timeOff], "2026-08-12").map((item) => item.key)).toEqual([timeOff.key]);
    expect(getTimedWeekSegments([timeOff], week).map((segment) => segment.item.key)).toEqual([timeOff.key]);
    expect(filterCalendarItems([timeOff], DEFAULT_CALENDAR_FILTERS, "u2").map((item) => item.key)).toEqual([timeOff.key]);
    expect(filterCalendarItems([timeOff], { ...DEFAULT_CALENDAR_FILTERS, timeOff: false }, "u2")).toEqual([]);
  });

  it("keeps all-day time off out of the hourly grid and accepts timed time off in ordinary overlap layout", () => {
    const allDay = absence("all-day", "Taylor", "2026-08-12", "2026-08-12");
    const timeOff = timedAbsence("medical", "2026-08-12", "09:00", "12:00");
    const event = timedEvent("overlap", "2026-08-12T07:00:00.000Z", "2026-08-12T09:30:00.000Z");
    const week = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];
    const timed = getTimedWeekSegments([allDay, timeOff, event], week);
    const layout = getTimedWeekLayout(timed);

    expect(timed.map((segment) => segment.itemId)).toEqual([timeOff.key, event.key]);
    expect(getWeekAllDaySegments([allDay, timeOff], week).map((segment) => segment.itemId)).toEqual([allDay.key]);
    expect(layout.filter((segment) => segment.date === "2026-08-12").map((segment) => segment.columnCount)).toEqual([2, 2]);
  });

  it("allocates deterministic side-by-side columns only within overlap groups", () => {
    const first = timedEvent("first", "2026-07-27T06:00:00.000Z", "2026-07-27T07:00:00.000Z");
    const overlap = timedEvent("overlap", "2026-07-27T06:30:00.000Z", "2026-07-27T07:30:00.000Z");
    const later = timedEvent("later", "2026-07-27T08:00:00.000Z", "2026-07-27T09:00:00.000Z");
    const layout = getTimedWeekLayout(getTimedWeekSegments([later, overlap, first], dates));
    expect(layout.find((segment) => segment.itemId === first.key)).toMatchObject({ columnCount: 2 });
    expect(layout.find((segment) => segment.itemId === overlap.key)).toMatchObject({ columnCount: 2 });
    expect(layout.find((segment) => segment.itemId === later.key)).toMatchObject({ column: 0, columnCount: 1 });
  });

  it("splits midnight-crossing events into day-local segments that retain the source identity", () => {
    const event = timedEvent("overnight", "2026-07-27T20:00:00.000Z", "2026-07-28T00:30:00.000Z");
    const segments = getTimedWeekSegments([event], dates);
    expect(segments.map((segment) => [segment.date, segment.startMinute, segment.endMinute])).toEqual([["2026-07-27", 1380, 1440], ["2026-07-28", 0, 210]]);
    expect(new Set(segments.map((segment) => segment.item))).toEqual(new Set([event]));
  });

  it("renders all-day week items as continuous segments without changing inclusive time-off dates", () => {
    const timeOff = absence("week", "Taylor", "2026-07-31", "2026-08-02");
    expect(getWeekAllDaySegments([timeOff], dates)[0]).toMatchObject({ startColumn: 5, endColumn: 7, columnSpan: 3, item: timeOff });
  });

  it("calculates Kyiv current-time placement and the initial scroll without DST date drift", () => {
    const dstWeek = ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"];
    expect(getCurrentWeekTimePosition(dstWeek, new Date("2026-03-29T06:15:00.000Z"))).toEqual({ dayIndex: 6, minute: 555 });
    expect(getCurrentWeekTimePosition(dates, new Date("2026-03-29T06:15:00.000Z"))).toBeNull();
    expect(getInitialWeekScrollTop()).toBe(480);
  });
});

describe("Calendar filtering and identity", () => {
  it("keeps task deadlines off by default", () => { expect(DEFAULT_CALENDAR_FILTERS.taskDeadlines).toBe(false); expect(filterCalendarItems([task()], DEFAULT_CALENDAR_FILTERS, "u1")).toEqual([]); });
  it("filters by category, project, person, and relevance", () => {
    const items = [deadline(), task()];
    expect(filterCalendarItems(items, { ...DEFAULT_CALENDAR_FILTERS, taskDeadlines: true, projectId: "p1", personId: "u2", mine: true }, "u2").map((item) => item.key)).toEqual(["task_deadline:t1"]);
  });
  it("keeps birthday, anniversary, and payment filters independently enabled by default", () => {
    const items = [birthday(), anniversary(), salaryPayment()];
    expect(filterCalendarItems(items, DEFAULT_CALENDAR_FILTERS, "u1")).toHaveLength(3);
    expect(filterCalendarItems(items, { ...DEFAULT_CALENDAR_FILTERS, birthdays: false }, "u1").map((item) => item.source)).toEqual(["team_anniversary", "salary_payment"]);
    expect(filterCalendarItems(items, { ...DEFAULT_CALENDAR_FILTERS, teamAnniversaries: false }, "u1").map((item) => item.source)).toEqual(["birthday", "salary_payment"]);
    expect(filterCalendarItems(items, { ...DEFAULT_CALENDAR_FILTERS, salaryPayments: false }, "u1").map((item) => item.source)).toEqual(["team_anniversary", "birthday"]);
  });
  it("uses source-qualified unique IDs and removes duplicate joined rows", () => {
    const items = deduplicateCalendarItems([deadline(), deadline(), task({ id: "p1", key: "task_deadline:p1" })]);
    expect(items.map((item) => item.key)).toEqual(["project_deadline:p1", "task_deadline:p1"]); expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
  it("merges local mutations without duplicating an item", () => { expect(mergeCalendarItem([deadline(), deadline()], deadline({ title: "Updated" }))).toHaveLength(1); });
  it("deduplicates the same absence returned by direct and RPC sources without merging separate people", () => {
    const direct = normalizePrivateTimeOff({ id: "r1", userId: "u1", employeeName: "Avery", requestType: "vacation", status: "approved", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true, privateNote: "Private", reviewNote: "Reviewed", reviewedBy: "admin", reviewedAt: null, currentUserId: "admin" });
    const rpcDuplicate = normalizeCoworkerTimeOff({ id: "r1", userId: "u1", employeeName: "Avery", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true, status: "approved" });
    const overlappingPerson = normalizeCoworkerTimeOff({ id: "r2", userId: "u2", employeeName: "Taylor", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true, status: "approved" });
    if (!direct || !rpcDuplicate || !overlappingPerson) throw new Error("Expected normalized absences");
    const items = deduplicateCalendarItems([rpcDuplicate, direct, overlappingPerson]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(["Avery", "Taylor"]);
    expect(items.find((item) => item.id === "r1")?.source).toBe("time_off_request_admin");
  });
});

describe("Calendar privacy and workflow", () => {
  const raw = { id: "r1", userId: "u2", employeeName: "Taylor", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true };
  it("hides rejected and cancelled requests from Calendar read models and gives approved availability a named generic label", () => {
    expect(normalizeCoworkerTimeOff({ ...raw, status: "rejected" })).toBeNull(); expect(normalizeCoworkerTimeOff({ ...raw, status: "cancelled" })).toBeNull();
    expect(normalizePrivateTimeOff({ ...raw, requestType: "vacation", status: "rejected", privateNote: null, reviewNote: "Not approved", reviewedBy: "admin", reviewedAt: null, currentUserId: "admin" })).toBeNull();
    expect(normalizePrivateTimeOff({ ...raw, requestType: "vacation", status: "cancelled", privateNote: null, reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "admin" })).toBeNull();
    const availability = normalizeCoworkerTimeOff({ ...raw, status: "approved" });
    expect(availability).toMatchObject({ title: "Taylor", source: "time_off" });
    expect(availability?.title).not.toContain("medical_appointment");
    expect(availability?.title).not.toContain("Private");
    expect(availability?.title).not.toContain("review");
    if (!availability) throw new Error("Expected approved availability");
    expect(getDayItems([availability], raw.startDate)[0]?.title).toBe("Taylor");
  });
  it("retains allowed private fields for the owner/admin detail model", () => {
    expect(normalizePrivateTimeOff({ ...raw, requestType: "medical_appointment", status: "pending", privateNote: "Private", reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "u2" })).toMatchObject({ requestType: "medical_appointment", privateNote: "Private", isOwn: true });
  });
  it("uses the absent person's name for own and administrator-visible approved availability", () => {
    const own = normalizePrivateTimeOff({ ...raw, employeeName: "Vasilios Liakhovskyi", requestType: "vacation", status: "approved", privateNote: "Private", reviewNote: "Reviewed", reviewedBy: "admin-1", reviewedAt: null, currentUserId: "u2" });
    const adminVisible = normalizePrivateTimeOff({ ...raw, employeeName: "Vasilios Genshin", requestType: "medical_appointment", status: "approved", privateNote: "Medical details", reviewNote: "Reviewed", reviewedBy: "admin-1", reviewedAt: null, currentUserId: "admin-1" });
    const adminOwn = normalizePrivateTimeOff({ ...raw, id: "r2", userId: "admin-1", employeeName: "Studio Admin", requestType: "day_off", status: "approved", privateNote: null, reviewNote: null, reviewedBy: "admin-1", reviewedAt: null, currentUserId: "admin-1" });
    expect(own).toMatchObject({ title: "Vasilios Liakhovskyi", subjectUserId: "u2", subjectName: "Vasilios Liakhovskyi", isOwn: true });
    expect(adminVisible).toMatchObject({ title: "Vasilios Genshin", subjectName: "Vasilios Genshin", isOwn: false });
    expect(adminOwn).toMatchObject({ title: "Studio Admin", isOwn: true });
    expect(adminVisible?.title).not.toContain("admin-1");
    expect(adminVisible?.title).not.toContain("medical_appointment");
    expect(adminVisible?.title).not.toContain("Medical details");
    expect(adminVisible?.title).not.toContain("Reviewed");
  });
  it("derives stable localized titles for Month, Week, Agenda, and existing normalized records", () => {
    const availability = normalizeCoworkerTimeOff({ ...raw, employeeName: "", status: "approved" });
    if (!availability) throw new Error("Expected normalized availability");
    expect(availability.title).toBe("");
    const englishLabels = { outOfOffice: "Out of office", pendingRequest: "Pending request", rejectedRequest: "Rejected request", unknownEmployee: "Team member" };
    const ukrainianLabels = { outOfOffice: "Відсутній(-я)", pendingRequest: "Запит очікує", rejectedRequest: "Запит відхилено", unknownEmployee: "Невідомо" };
    const visibleItem = getDayItems([availability], raw.startDate)[0];
    if (!visibleItem) throw new Error("Expected visible availability");
    const englishTitles = ["month", "week", "agenda"].map(() => getCalendarItemDisplayTitle(visibleItem, englishLabels));
    const ukrainianTitles = ["month", "week", "agenda"].map(() => getCalendarItemDisplayTitle(visibleItem, ukrainianLabels));
    expect(englishTitles).toEqual(["Team member: Out of office", "Team member: Out of office", "Team member: Out of office"]);
    expect(ukrainianTitles).toEqual(["Невідомо: Відсутній(-я)", "Невідомо: Відсутній(-я)", "Невідомо: Відсутній(-я)"]);
    const existingRecord = { ...availability, title: "Taylor · Out of office", subjectName: "Taylor" };
    expect(getCalendarItemDisplayTitle(existingRecord, ukrainianLabels)).toBe("Taylor: Відсутній(-я)");
    expect(getCalendarItemDisplayTitle(allDayEvent(raw.startDate, raw.endDate), ukrainianLabels)).toBe("Studio event");
  });
  it("prevents employees from approving and enforces the transition matrix", () => {
    expect(canTransitionTimeOff("pending", "approved", "employee")).toBe(false); expect(canTransitionTimeOff("pending", "cancelled", "employee")).toBe(true);
    expect(canTransitionTimeOff("pending", "approved", "admin")).toBe(true); expect(canTransitionTimeOff("approved", "rejected", "admin")).toBe(false); expect(canTransitionTimeOff("cancelled", "approved", "admin")).toBe(false);
  });
  it("enforces attendee studio and project consistency", () => {
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s2", projectId: null, eventType: "meeting", personProjectIds: [] })).toBe(false);
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s1", projectId: "p1", eventType: "interview", personProjectIds: [] })).toBe(true);
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s1", projectId: "p1", eventType: "site_visit", personProjectIds: [] })).toBe(false);
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s1", projectId: "p1", eventType: "site_visit", personProjectIds: ["p1"] })).toBe(true);
  });
});

describe("Production-shaped time-off normalization", () => {
  it("preserves PostgreSQL seconds-formatted partial-day times for employee and admin Calendar sources", () => {
    const coworker = normalizeCoworkerTimeOff({ ...rawPartialTimeOff, status: "approved" });
    const admin = normalizePrivateTimeOff({ ...rawPartialTimeOff, requestType: "medical_appointment", status: "approved", privateNote: "Private", reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "admin" });

    expect(coworker).toMatchObject({ source: "time_off", allDay: false, startDate: "2026-08-12", endDate: "2026-08-12", startTime: "09:00", endTime: "12:00" });
    expect(admin).toMatchObject({ source: "time_off_request_admin", allDay: false, startTime: "09:00", endTime: "12:00" });
  });

  it("normalizes partial-day sick leave while preserving full-day and malformed-row semantics", () => {
    const sickLeave = normalizePrivateTimeOff({ ...rawPartialTimeOff, id: "sick-leave", requestType: "sick_leave", startTime: "13:15:00", endTime: "15:45:00", status: "approved", privateNote: null, reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "u2" });
    const vacation = normalizeCoworkerTimeOff({ ...rawPartialTimeOff, id: "vacation", startTime: null, endTime: null, allDay: true, status: "approved" });
    const malformedPartial = normalizeCoworkerTimeOff({ ...rawPartialTimeOff, id: "malformed", startTime: null, endTime: null, allDay: false, status: "approved" });

    expect(sickLeave).toMatchObject({ allDay: false, startTime: "13:15", endTime: "15:45" });
    expect(vacation).toMatchObject({ allDay: true, startTime: null, endTime: null });
    expect(malformedPartial).toMatchObject({ allDay: false, startTime: null, endTime: null });
    expect(normalizeCalendarTime("09:00:00")).toBe("09:00");
    expect(normalizeCalendarTime("09:00:30.500")).toBe("09:00");
  });
});

describe("Calendar input validation", () => {
  it("requires event end after start", () => { expect(isValidEventRange("2026-07-28T09:00:00Z", "2026-07-28T10:00:00Z")).toBe(true); expect(isValidEventRange("2026-07-28T10:00:00Z", "2026-07-28T10:00:00Z")).toBe(false); });
  it("rejects invalid all-day and partial time-off ranges", () => {
    expect(isValidTimeOffRange({ startDate: "2026-07-29", endDate: "2026-07-28", allDay: true })).toBe(false);
    expect(isValidTimeOffRange({ startDate: "2026-07-28", endDate: "2026-07-29", allDay: false, startTime: "09:00", endTime: "10:00" })).toBe(false);
    expect(isValidTimeOffRange({ startDate: "2026-07-28", endDate: "2026-07-28", allDay: false, startTime: "10:00", endTime: "09:00" })).toBe(false);
  });
});
