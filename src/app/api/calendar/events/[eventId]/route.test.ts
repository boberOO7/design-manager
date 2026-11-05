import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@/types/calendar";
import { getWeekEventUpdate } from "@/lib/calendar-week-edit";
import { calendarEventSchema } from "@/lib/validation/calendar";

const mocks = vi.hoisted(() => ({ client: vi.fn(), membership: vi.fn(), normalize: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/active-studio-membership", () => ({ getActiveStudioMembership: mocks.membership }));
vi.mock("@/data/queries/calendar-item", () => ({ getNormalizedCalendarEvent: mocks.normalize }));
vi.mock("@/lib/google-calendar/queue", () => ({ scheduleGoogleCalendarReconciliation: mocks.reconcile }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "uk" }));
import { PATCH } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const person = { id: userId, full_name: "Organizer", job_title: "Designer", avatar_url: null, projectIds: [] };
const item: Extract<CalendarItem, { source: "calendar_event" }> = {
  id: eventId, key: `calendar_event:${eventId}`, source: "calendar_event", eventType: "general", title: "Test",
  startsAt: "2026-11-02T08:00:00.000Z", endsAt: "2026-11-02T09:00:00.000Z", startDate: "2026-11-02", endDate: "2026-11-02",
  allDay: false, projectId: null, personIds: [userId], description: null, location: null, meetingUrl: null, meetingMode: null,
  organizer: person, invitees: [], participants: [], project: null,
};
const schedule = { intent: "reschedule", startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-03T10:30:00.000Z", expectedStartsAt: item.startsAt, expectedEndsAt: item.endsAt };
const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn((_table: string) => query);
async function patch(body: unknown = schedule) {
  return PATCH(new Request(`http://localhost/api/calendar/events/${eventId}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ eventId }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [query.select, query.eq, query.is, query.update]) fn.mockReturnValue(query);
  query.maybeSingle.mockReset().mockResolvedValueOnce({ data: { updated_at: "version", recurrence_rule: null }, error: null }).mockResolvedValue({ data: { starts_at: schedule.startsAt, ends_at: schedule.endsAt }, error: null });
  mocks.membership.mockResolvedValue({ studio_id: "studio", authenticatedUserId: userId, system_role: "employee" });
  mocks.client.mockResolvedValue({ from });
  mocks.normalize.mockResolvedValue(item);
});

describe("Calendar schedule PATCH", () => {
  it("reproduces the original 400 from serialized Zod output, before any DB call", async () => {
    const request = getWeekEventUpdate(item, schedule, "Europe/Kyiv");
    const oldPayload = calendarEventSchema.parse(request);
    const response = await patch(oldPayload);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, fieldErrors: { location: expect.any(String), description: expect.any(String), meetingUrl: expect.any(String) } });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("updates only timestamps in one guarded write, with no post-commit reload or relation writes", async () => {
    const response = await patch();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, item: { ...item, startsAt: schedule.startsAt, endsAt: schedule.endsAt, startDate: "2026-11-03", endDate: "2026-11-03" } });
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ starts_at: schedule.startsAt, ends_at: schedule.endsAt });
    expect(query.eq).toHaveBeenCalledWith("studio_id", "studio");
    expect(query.eq).toHaveBeenCalledWith("updated_at", "version");
    expect(query.eq).toHaveBeenCalledWith("starts_at", item.startsAt);
    expect(query.eq).toHaveBeenCalledWith("ends_at", item.endsAt);
    expect(from.mock.calls.every(([table]) => table === "calendar_events")).toBe(true);
    expect(mocks.normalize).toHaveBeenCalledOnce();
    expect(mocks.normalize.mock.invocationCallOrder[0]).toBeLessThan(query.update.mock.invocationCallOrder[0]);
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it("preserves every site-visit participant when the organizer is an employee", async () => {
    const visit = { ...item, eventType: "site_visit", projectId: eventId, participants: [person, { ...person, id: eventId }] };
    mocks.normalize.mockResolvedValue(visit);
    const response = await patch();
    expect(response.status).toBe(200);
    expect((await response.json()).item.participants).toEqual(visit.participants);
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ starts_at: schedule.startsAt, ends_at: schedule.endsAt });
  });

  it.each(["meeting", "presentation", "site_visit", "interview"])("retains same-Kyiv-day validation for %s", async (eventType) => {
    mocks.membership.mockResolvedValue({ studio_id: "studio", authenticatedUserId: userId, system_role: "admin" });
    mocks.normalize.mockResolvedValue({ ...item, eventType, projectId: eventType === "site_visit" ? eventId : null, participants: eventType === "site_visit" ? [person] : [], assigneeId: eventType === "interview" ? userId : null });
    const response = await patch({ ...schedule, startsAt: "2026-11-03T21:30:00Z", endsAt: "2026-11-03T22:30:00Z" });
    expect(response.status).toBe(400);
    expect(query.update).not.toHaveBeenCalled();
  });

  it.each([{ allDay: true }, { seriesId: eventId }, { occurrenceStart: item.startsAt }, { eventType: "business_trip" }, { eventType: "work_makeup" }, { eventType: "interview" }, { organizer: { ...person, id: eventId } }])("rejects unsupported or unauthorized schedules: %j", async (change) => {
    mocks.normalize.mockResolvedValue({ ...item, ...change });
    expect((await patch()).status).toBe(403);
    expect(query.update).not.toHaveBeenCalled();
  });

  it("checks persisted recurrence even though the normalized detail item omits it", async () => {
    query.maybeSingle.mockReset().mockResolvedValue({ data: { updated_at: "version", recurrence_rule: { frequency: "weekly" } }, error: null });
    expect((await patch()).status).toBe(403);
    expect(query.update).not.toHaveBeenCalled();
  });
  it("rejects anonymous requests and unknown fields before writing", async () => {
    expect((await patch({ ...schedule, title: "Accidental change" })).status).toBe(400);
    mocks.membership.mockResolvedValue(null);
    expect((await patch()).status).toBe(403);
    expect(query.update).not.toHaveBeenCalled();
  });
  it("reports a stale timestamp/version as 409 without scheduling side effects", async () => {
    query.maybeSingle.mockReset().mockResolvedValueOnce({ data: { updated_at: "version", recurrence_rule: null }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect((await patch()).status).toBe(409);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("returns a DB rejection without making subsequent writes", async () => {
    query.maybeSingle.mockReset().mockResolvedValueOnce({ data: { updated_at: "version", recurrence_rule: null }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "Events on completed or archived projects cannot change" } });
    const response = await patch();
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty("projectId");
    expect(query.update).toHaveBeenCalledOnce();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(item.startsAt).toBe(schedule.expectedStartsAt);
  });
});
