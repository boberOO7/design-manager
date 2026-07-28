import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_FILTERS, canAttendCalendarEvent, canTransitionTimeOff, deduplicateCalendarItems,
  filterCalendarItems, getDayItems, getMonthGrid, getVisibleDayItems, instantToDateOnly,
  isValidEventRange, isValidTimeOffRange, itemOccursOn, mergeCalendarItem,
  normalizeCoworkerTimeOff, normalizePrivateTimeOff, sortCalendarItems,
} from "./calendar";
import type { CalendarItem } from "@/types/calendar";

function deadline(overrides: Partial<Extract<CalendarItem, { source: "project_deadline" }>> = {}): Extract<CalendarItem, { source: "project_deadline" }> {
  return { source: "project_deadline", key: "project_deadline:p1", id: "p1", title: "Project", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: "p1", personIds: ["u1"], project: { id: "p1", name: "Project", clientName: null, status: "active" }, ...overrides };
}
function task(overrides: Partial<Extract<CalendarItem, { source: "task_deadline" }>> = {}): Extract<CalendarItem, { source: "task_deadline" }> {
  return { source: "task_deadline", key: "task_deadline:t1", id: "t1", title: "Task", startDate: "2026-07-28", endDate: "2026-07-28", allDay: true, projectId: "p1", personIds: ["u2"], task: { id: "t1", projectId: "p1", projectName: "Project", description: null, status: "todo", priority: "normal", assigneeId: "u2", assigneeName: "Taylor" }, ...overrides };
}

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

describe("Calendar filtering and identity", () => {
  it("keeps task deadlines off by default", () => { expect(DEFAULT_CALENDAR_FILTERS.taskDeadlines).toBe(false); expect(filterCalendarItems([task()], DEFAULT_CALENDAR_FILTERS, "u1")).toEqual([]); });
  it("filters by category, project, person, and relevance", () => {
    const items = [deadline(), task()];
    expect(filterCalendarItems(items, { ...DEFAULT_CALENDAR_FILTERS, taskDeadlines: true, projectId: "p1", personId: "u2", mine: true }, "u2").map((item) => item.key)).toEqual(["task_deadline:t1"]);
  });
  it("uses source-qualified unique IDs and removes duplicate joined rows", () => {
    const items = deduplicateCalendarItems([deadline(), deadline(), task({ id: "p1", key: "task_deadline:p1" })]);
    expect(items.map((item) => item.key)).toEqual(["project_deadline:p1", "task_deadline:p1"]); expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
  it("merges local mutations without duplicating an item", () => { expect(mergeCalendarItem([deadline(), deadline()], deadline({ title: "Updated" }))).toHaveLength(1); });
});

describe("Calendar privacy and workflow", () => {
  const raw = { id: "r1", userId: "u2", employeeName: "Taylor", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true };
  it("hides rejected and cancelled requests from coworkers and makes approved availability generic", () => {
    expect(normalizeCoworkerTimeOff({ ...raw, status: "rejected" })).toBeNull(); expect(normalizeCoworkerTimeOff({ ...raw, status: "cancelled" })).toBeNull();
    expect(normalizeCoworkerTimeOff({ ...raw, status: "approved" })).toMatchObject({ title: "Out of office", source: "time_off" });
  });
  it("retains allowed private fields for the owner/admin detail model", () => {
    expect(normalizePrivateTimeOff({ ...raw, requestType: "medical_appointment", status: "pending", privateNote: "Private", reviewNote: null, reviewedBy: null, reviewedAt: null, currentUserId: "u2" })).toMatchObject({ requestType: "medical_appointment", privateNote: "Private", isOwn: true });
  });
  it("prevents employees from approving and enforces the transition matrix", () => {
    expect(canTransitionTimeOff("pending", "approved", "employee")).toBe(false); expect(canTransitionTimeOff("pending", "cancelled", "employee")).toBe(true);
    expect(canTransitionTimeOff("pending", "approved", "admin")).toBe(true); expect(canTransitionTimeOff("approved", "rejected", "admin")).toBe(false); expect(canTransitionTimeOff("cancelled", "approved", "admin")).toBe(false);
  });
  it("enforces attendee studio and project consistency", () => {
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s2", projectId: null, eventType: "meeting", personProjectIds: [] })).toBe(false);
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s1", projectId: "p1", eventType: "site_visit", personProjectIds: [] })).toBe(false);
    expect(canAttendCalendarEvent({ eventStudioId: "s1", personStudioId: "s1", projectId: "p1", eventType: "site_visit", personProjectIds: ["p1"] })).toBe(true);
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
