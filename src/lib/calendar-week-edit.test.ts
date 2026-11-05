import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@/types/calendar";
import { canEditWeekEvent, getWeekEventPreviewSegments, getWeekEventBounds, getWeekEventUpdate, weekEventBoundsChanged, getWeekEventEditLayout } from "./calendar-week-edit";
import { getTimedWeekLayout, type TimedWeekSegment, type TimedWeekLayoutSegment } from "./calendar";
import { calendarEventSchema } from "./validation/calendar";
import { saveCalendarEvent } from "./calendar-event-client";

const owner = { id: "11111111-1111-4111-8111-111111111111", full_name: "Organizer", job_title: "designer", avatar_url: null, projectIds: [] };
function event(patch: Partial<Extract<CalendarItem, { source: "calendar_event" }>> = {}): Extract<CalendarItem, { source: "calendar_event" }> {
  return { source: "calendar_event", id: "22222222-2222-4222-8222-222222222222", key: "calendar_event:test", title: "Existing title", eventType: "general", startsAt: "2026-11-02T07:00:00.000Z", endsAt: "2026-11-02T08:00:00.000Z", startDate: "2026-11-02", endDate: "2026-11-02", allDay: false, projectId: null, personIds: [owner.id], description: "Keep this description", location: "Keep this location", meetingUrl: null, meetingMode: null, organizer: owner, participants: [], invitees: [], project: null, ...patch };
}
const employee = { currentUserId: owner.id, isAdmin: false };
const administrator = { currentUserId: "admin", isAdmin: true };
const zone = "Europe/Kyiv";

afterEach(() => vi.unstubAllGlobals());

describe("Week event edit permissions", () => {
  it("allows an organizer or admin, but not another employee", () => {
    expect(canEditWeekEvent(event(), employee)).toBe(true);
    expect(canEditWeekEvent(event(), administrator)).toBe(true);
    expect(canEditWeekEvent(event(), { currentUserId: "other", isAdmin: false })).toBe(false);
  });
  it.each(["general", "meeting", "presentation", "site_visit"] as const)("supports timed %s", (eventType) => {
    expect(canEditWeekEvent(event({ eventType }), employee)).toBe(true);
  });
  it("allows interviews only for administrators", () => {
    expect(canEditWeekEvent(event({ eventType: "interview" }), employee)).toBe(false);
    expect(canEditWeekEvent(event({ eventType: "interview" }), administrator)).toBe(true);
  });
  it.each(["business_trip", "work_makeup", "internal_review"] as const)("keeps specialized %s in its form", (eventType) => {
    expect(canEditWeekEvent(event({ eventType }), administrator)).toBe(false);
  });
  it("excludes all-day events, recurrence, detached occurrences, and other sources", () => {
    expect(canEditWeekEvent(event({ allDay: true }), administrator)).toBe(false);
    expect(canEditWeekEvent(event({ recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null } }), administrator)).toBe(false);
    expect(canEditWeekEvent(event({ occurrenceStart: "2026-11-02T07:00:00Z" }), administrator)).toBe(false);
    expect(canEditWeekEvent(event({ seriesId: "series" }), administrator)).toBe(false);
    const absence: CalendarItem = { source: "time_off", key: "absence", id: "absence", title: "Absence", startDate: "2026-11-02", endDate: "2026-11-02", allDay: false, projectId: null, personIds: [], subjectUserId: owner.id, subjectName: "Organizer", startTime: "09:00", endTime: "10:00" };
    expect(canEditWeekEvent(absence, administrator)).toBe(false);
  });
});

describe("Week move and resize geometry", () => {
  it("snaps the new start absolutely and preserves an off-grid duration without mutating the source", () => {
    const source = Object.freeze(event({ startsAt: "2026-11-02T07:07:00.000Z", endsAt: "2026-11-02T07:44:00.000Z" }));
    const result = getWeekEventBounds(source, "move", "2026-11-02", "2026-11-03", 23, zone);
    expect(result).toEqual({ startsAt: "2026-11-03T07:30:00.000Z", endsAt: "2026-11-03T08:07:00.000Z" });
    expect(getWeekEventBounds(source, "move", "2026-11-02", "2026-11-03", 23, zone)).toEqual(result);
    expect(source.startsAt).toBe("2026-11-02T07:07:00.000Z");
  });
  it("moves across the week while keeping duration", () => {
    expect(getWeekEventBounds(event(), "move", "2026-11-02", "2026-11-08", 75, zone)).toEqual({ startsAt: "2026-11-08T08:15:00.000Z", endsAt: "2026-11-08T09:15:00.000Z" });
  });
  it("uses the grabbed segment's day for an overnight event", () => {
    const source = event({ startsAt: "2026-11-02T21:00:00.000Z", endsAt: "2026-11-02T23:00:00.000Z" });
    expect(getWeekEventBounds(source, "move", "2026-11-03", "2026-11-04", 0, zone)).toEqual({ startsAt: "2026-11-03T21:00:00.000Z", endsAt: "2026-11-03T23:00:00.000Z" });
  });
  it("keeps wall time across a DST boundary and rejects nonexistent local times", () => {
    const source = event({ startsAt: "2026-03-28T07:00:00.000Z", endsAt: "2026-03-28T08:00:00.000Z" });
    expect(getWeekEventBounds(source, "move", "2026-03-28", "2026-03-29", 0, zone)).toEqual({ startsAt: "2026-03-29T06:00:00.000Z", endsAt: "2026-03-29T07:00:00.000Z" });
    expect(getWeekEventBounds(event({ startsAt: "2026-03-28T01:15:00.000Z", endsAt: "2026-03-28T02:15:00.000Z" }), "move", "2026-03-28", "2026-03-29", 0, zone)).toBeNull();
  });
  it("uses the calendar timezone rather than the execution timezone", () => {
    expect(getWeekEventBounds(event(), "move", "2026-11-02", "2026-11-03", 15, "America/New_York")).toEqual({ startsAt: "2026-11-03T07:15:00.000Z", endsAt: "2026-11-03T08:15:00.000Z" });
  });
  it("resizes only the end and clamps to at least 15 minutes", () => {
    expect(getWeekEventBounds(event(), "resize", "2026-11-02", "2026-11-02", 30, zone)).toEqual({ startsAt: "2026-11-02T07:00:00.000Z", endsAt: "2026-11-02T08:30:00.000Z" });
    expect(getWeekEventBounds(event(), "resize", "2026-11-02", "2026-11-02", -120, zone)).toEqual({ startsAt: "2026-11-02T07:00:00.000Z", endsAt: "2026-11-02T07:15:00.000Z" });
    expect(getWeekEventBounds(event({ startsAt: "2026-11-02T07:07:00.000Z" }), "resize", "2026-11-02", "2026-11-02", -120, zone)?.endsAt).toBe("2026-11-02T07:30:00.000Z");
    expect(getWeekEventBounds(event(), "resize", "2026-11-02", "2026-11-03", 30, zone)).toBeNull();
  });
  it("retains same-day restrictions of meeting and presentation payloads", () => {
    for (const eventType of ["meeting", "presentation"] as const) {
      const source = event({ eventType, meetingMode: "offline" });
      expect(getWeekEventUpdate(source, { startsAt: "2026-11-02T21:45:00.000Z", endsAt: "2026-11-02T22:45:00.000Z" }, zone)).toBeNull();
    }
  });
  it("ignores an unchanged drop, including equivalent timestamp spellings", () => {
    expect(weekEventBoundsChanged(event(), { startsAt: "2026-11-02T09:00:00+02:00", endsAt: "2026-11-02T10:00:00+02:00" })).toBe(false);
  });
});

describe("Continuous visual preview with snapped persistence", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];
  it("follows fractional pointer movement while the saved start stays on the 15-minute grid", () => {
    const original = event();
    const bounds = getWeekEventBounds(original, "move", dates[0], dates[1], 2.5, zone)!;
    const preview = { original, item: { ...original, ...bounds }, valid: true, mode: "move" as const, sourceDate: dates[0], targetDate: dates[1], deltaMinutes: 2.5 };
    expect(bounds.startsAt).toBe("2026-11-03T07:00:00.000Z");
    const [first] = getWeekEventPreviewSegments(preview, dates, zone);
    const [next] = getWeekEventPreviewSegments({ ...preview, deltaMinutes: 3.25 }, dates, zone);
    expect(first.date).toBe(dates[1]);
    expect(first.startMinute).toBe(542.5);
    expect(first.endMinute - first.startMinute).toBe(60);
    expect(next.startMinute).toBe(543.25);
    expect(next.endMinute - next.startMinute).toBe(60);
  });
  it("resizes continuously, keeps the start fixed, and clamps the visual minimum", () => {
    const original = event();
    const bounds = getWeekEventBounds(original, "resize", dates[0], dates[0], 2.5, zone)!;
    const preview = { original, item: { ...original, ...bounds }, valid: true, mode: "resize" as const, sourceDate: dates[0], targetDate: dates[0], deltaMinutes: 2.5 };
    expect(bounds.endsAt).toBe(original.endsAt);
    const [segment] = getWeekEventPreviewSegments(preview, dates, zone);
    expect(segment.startMinute).toBe(540);
    expect(segment.endMinute).toBe(602.5);
    expect(getWeekEventPreviewSegments({ ...preview, deltaMinutes: -100 }, dates, zone)).toMatchObject([{ startMinute: 540, endMinute: 555 }]);
  });
  it("clips continuous movement into adjacent days instead of painting across a day boundary", () => {
    const original = event({ startsAt: "2026-11-02T21:00:00.000Z", endsAt: "2026-11-02T22:00:00.000Z" });
    const preview = { original, item: original, valid: true, mode: "move" as const, sourceDate: dates[0], targetDate: dates[0], deltaMinutes: 2.5 };
    const [first, next] = getWeekEventPreviewSegments(preview, dates, zone);
    expect(first).toMatchObject({ date: dates[0], endMinute: 1440 });
    expect(first.startMinute).toBe(1382.5);
    expect(next).toMatchObject({ date: dates[1], startMinute: 0 });
    expect(next.endMinute).toBe(2.5);
  });
  it("uses the new timezone duration when a move crosses a DST transition", () => {
    const original = event({ startsAt: "2026-03-28T00:00:00.000Z", endsAt: "2026-03-28T02:00:00.000Z" });
    const bounds = getWeekEventBounds(original, "move", "2026-03-28", "2026-03-29", 0, zone)!;
    expect(getWeekEventPreviewSegments({ original, item: { ...original, ...bounds }, valid: true, mode: "move", sourceDate: "2026-03-28", targetDate: "2026-03-29", deltaMinutes: 0 }, ["2026-03-29"], zone)).toMatchObject([{ startMinute: 120, endMinute: 300 }]);
  });
  it("leaves invalid previews at their validated bounds", () => {
    const original = event();
    expect(getWeekEventPreviewSegments({ original, item: original, valid: false, mode: "resize", sourceDate: dates[0], targetDate: dates[1], deltaMinutes: 200 }, dates, zone)).toMatchObject([{ startMinute: 540, endMinute: 600 }]);
  });
});

describe("Stable columns during Week editing", () => {
  const day = "2026-11-02";
  const segment = (id: string, startMinute: number, endMinute: number, date = day): TimedWeekSegment => ({ itemId: id, segmentId: `${id}:timed:${date}`, item: event({ key: id }), date, startMinute, endMinute });
  const safe = (layout: TimedWeekLayoutSegment[]) => {
    for (const left of layout) for (const right of layout) {
      if (left.segmentId === right.segmentId || left.date !== right.date || left.endMinute <= right.startMinute || right.endMinute <= left.startMinute) continue;
      expect(left.column).not.toBe(right.column);
      expect(left.columnCount).toBe(right.columnCount);
    }
  };

  it("keeps the dragged left lane when passing consecutive meetings and fractional end boundaries", () => {
    const initial = getTimedWeekLayout([segment("visit", 600, 720), segment("binotel", 660, 720), segment("sleep", 720, 780)]);
    for (const minute of [600, 659.9, 660, 660.1, 690, 719.9, 720, 720.1, 750]) {
      const layout = getWeekEventEditLayout(initial, [segment("visit", minute, minute + 120)], "visit", day);
      expect(layout.find((item) => item.itemId === "visit")).toMatchObject({ column: 0, columnCount: 2 });
      expect(layout.find((item) => item.itemId === "sleep")).toMatchObject(minute === 600 ? { column: 0, columnCount: 1 } : { column: 1, columnCount: 2 });
      safe(layout);
    }
  });

  it("preserves a grabbed right column and reflows neighbors when resizing across earlier starts", () => {
    const initial = getTimedWeekLayout([segment("first", 600, 660), segment("active", 630, 645), segment("later", 660, 720)]);
    for (const end of [645, 660, 660.1, 700, 760]) {
      const layout = getWeekEventEditLayout(initial, [segment("active", 630, end)], "active", day);
      expect(layout.find((item) => item.itemId === "active")).toMatchObject({ column: 1, columnCount: 2 });
      safe(layout);
    }
  });

  it("uses a shared three-column layout and only collapses a lane when the overlap count falls", () => {
    const initial = getTimedWeekLayout([segment("first", 600, 780), segment("second", 610, 780), segment("active", 620, 680)]);
    for (const minute of [590, 605, 615, 700]) {
      const layout = getWeekEventEditLayout(initial, [segment("active", minute, minute + 60)], "active", day);
      expect(layout.find((item) => item.itemId === "active")).toMatchObject({ column: 2, columnCount: 3 });
      safe(layout);
    }
    const separate = getWeekEventEditLayout(initial, [segment("active", 780, 840)], "active", day);
    expect(separate.find((item) => item.itemId === "active")).toMatchObject({ column: 0, columnCount: 1 });
    expect(separate.filter((item) => item.itemId !== "active").every((item) => item.columnCount === 2)).toBe(true);
    safe(separate);
  });

  it("reflows the source and destination days without changing event times or identities", () => {
    const nextDay = "2026-11-03";
    const initial = getTimedWeekLayout([segment("active", 600, 720), segment("source", 660, 720), segment("destination", 630, 720, nextDay)]);
    const replacement = segment("active", 660, 780, nextDay);
    const layout = getWeekEventEditLayout(initial, [replacement], "active", day);
    expect(layout.find((item) => item.itemId === "source")).toMatchObject({ column: 0, columnCount: 1, startMinute: 660, endMinute: 720 });
    expect(layout.find((item) => item.itemId === "active")).toMatchObject({ ...replacement, column: 0, columnCount: 2 });
    expect(layout.find((item) => item.itemId === "destination")).toMatchObject({ column: 1, columnCount: 2, startMinute: 630, endMinute: 720 });
    safe(layout);
  });

  it("retains the preview's columns after drop without adding empty lanes", () => {
    const initial = getTimedWeekLayout([segment("active", 600, 720), segment("other", 660, 720)]);
    const edited = getWeekEventEditLayout(initial, [segment("active", 690, 810)], "active", day);
    const columns = new Map(edited.map((item) => [item.segmentId, item.column]));
    expect(getTimedWeekLayout(edited, { columns })).toEqual(edited);
    const solo = edited.filter((item) => item.itemId === "other");
    expect(getTimedWeekLayout(solo, { columns })).toMatchObject([{ column: 0, columnCount: 1 }]);
  });

  it("inserts an incoming left lane without swapping the existing two events", () => {
    const initial = getTimedWeekLayout([segment("review", 780, 840), segment("visit-298", 795, 840), segment("visit-269", 855, 975)]);
    for (const start of [810, 800, 795, 780, 779.9]) {
      const layout = getWeekEventEditLayout(initial, [segment("visit-269", start, start + 120)], "visit-269", day);
      expect(layout.find((item) => item.itemId === "visit-269")).toMatchObject({ column: 0, columnCount: 3 });
      expect(layout.find((item) => item.itemId === "review")).toMatchObject({ column: 1, columnCount: 3 });
      expect(layout.find((item) => item.itemId === "visit-298")).toMatchObject({ column: 2, columnCount: 3 });
      safe(layout);
      expect(getTimedWeekLayout(layout, { columns: new Map(layout.map((item) => [item.segmentId, item.column])) })).toEqual(layout);
    }
  });
});

describe("Week event update and rollback baseline", () => {
  it("retains all unrelated fields and invitation IDs in the existing full PATCH contract", async () => {
    const invitee = { ...owner, id: "33333333-3333-4333-8333-333333333333", inviteId: "44444444-4444-4444-8444-444444444444", status: "accepted" as const };
    const source = Object.freeze(event({ invitees: [invitee], meetingUrl: "https://example.test/meeting" }));
    const bounds = getWeekEventBounds(source, "move", source.startDate, "2026-11-03", 15, zone);
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("Expected valid move");
    const payload = getWeekEventUpdate(source, bounds, zone);
    expect(payload).toMatchObject({ title: source.title, description: source.description, location: source.location, meetingUrl: source.meetingUrl, attendeeIds: [invitee.id], participantIds: [], eventType: source.eventType, meetingMode: null });
    const previewWithExtraFields = { ...source, ...bounds, title: "Preview must not replace unrelated fields" };
    expect(getWeekEventUpdate(source, previewWithExtraFields, zone)).toEqual(payload);
    if (!payload) throw new Error("Expected valid payload");
    // A request must survive JSON transport and the server's input parser.
    expect(calendarEventSchema.safeParse(JSON.parse(JSON.stringify(payload))).success).toBe(true);
    const previousBug = calendarEventSchema.parse({ ...payload, description: "" });
    expect(calendarEventSchema.safeParse(JSON.parse(JSON.stringify(previousBug))).success).toBe(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, formError: "Rejected" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { response } = await saveCalendarEvent(source.id, payload);
    expect(response.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/calendar/events/${source.id}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify(payload) }));
    // The stored item is the rollback baseline; only a successful response replaces it.
    expect(source.startsAt).toBe("2026-11-02T07:00:00.000Z");
    expect(source.endsAt).toBe("2026-11-02T08:00:00.000Z");
  });
});
