import { describe, expect, it } from "vitest";
import { addCalendarDays, getCalendarRange } from "./calendar";
import { getCalendarPendingCount, getCalendarWorkspaceRange, resolveCalendarSelection } from "./calendar-navigation";
import type { CalendarItem } from "@/types/calendar";

const request = (startDate: string, endDate = startDate, status: "pending" | "approved" = "pending"): CalendarItem => ({
  source: "time_off_request_admin", id: startDate, key: startDate, title: "Request", allDay: true,
  startDate, endDate, projectId: null, personIds: ["user"], subjectUserId: "user", subjectName: "User",
  requestType: "vacation", status, startTime: null, endTime: null, privateNote: null,
  reviewNote: null, reviewedBy: null, reviewedAt: null, isOwn: false,
});

describe("Calendar navigation coverage", () => {
  it("covers every view for every anchor, including leap days and year boundaries", () => {
    for (let anchor = "2024-01-01"; anchor <= "2024-12-31"; anchor = addCalendarDays(anchor, 1)) {
      const loaded = getCalendarWorkspaceRange(anchor);
      for (const view of ["month", "week", "agenda"] as const) {
        const visible = getCalendarRange(view, anchor);
        expect(loaded.start <= visible.start, `${anchor}:${view}:start`).toBe(true);
        expect(loaded.end >= visible.end, `${anchor}:${view}:end`).toBe(true);
      }
    }
  });

  it("includes the late-month agenda beyond the month grid without loading an arbitrary extra month", () => {
    expect(getCalendarWorkspaceRange("2026-11-30")).toEqual({ start: "2026-10-26", end: "2026-12-29" });
    expect(getCalendarWorkspaceRange("2026-11-01")).toEqual(getCalendarRange("month", "2026-11-01"));
  });

  it("uses the same validated URL selection on initial load and local history changes", () => {
    expect(resolveCalendarSelection("month", "2026-11-30")).toEqual({ view: "month", date: "2026-11-30" });
    expect(resolveCalendarSelection("agenda", "2026-11-30")).toEqual({ view: "agenda", date: "2026-11-30" });
    expect(resolveCalendarSelection(["month", "week"], ["2026-11-30"], "2026-11-11")).toEqual({ view: "week", date: "2026-11-11" });
    expect(resolveCalendarSelection("unknown", "bad", "2026-11-11")).toEqual({ view: "week", date: "2026-11-11" });
  });

  it("keeps the pending badge scoped to the visible range despite the broader snapshot", () => {
    const items = [request("2026-11-08", "2026-11-09"), request("2026-11-15"), request("2026-11-16"), request("2026-11-11", "2026-11-11", "approved")];
    expect(getCalendarPendingCount(items, getCalendarRange("week", "2026-11-11"))).toBe(2);
    expect(getCalendarPendingCount(items, getCalendarRange("month", "2026-11-11"))).toBe(3);
  });
});
