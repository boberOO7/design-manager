import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getCalendarData } from "./calendar";
import { DEFAULT_CALENDAR_FILTERS, filterCalendarItems, getTimedWeekSegments, mergeCalendarItem } from "@/lib/calendar";
import type { CalendarItem } from "@/types/calendar";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), role: "admin" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./active-studio-membership", () => ({ getActiveStudioMembership: async () => ({ system_role: mocks.role, studio_id: "studio", authenticatedUserId: "admin" }) }));

const cycle = {
  id: "cycle", outcome: null, interview_at: "2026-11-16T09:00:00Z",
  candidate: { id: "candidate", full_name: "Candidate", responsible_admin_id: "admin" }, events: [],
};

function setup(rows: unknown[], fail = false) {
  const queries: URL[] = [];
  const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
    auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      queries.push(url);
      const candidates = url.pathname.endsWith("/crm_recruiting_cycles");
      return new Response(JSON.stringify(candidates ? fail ? { message: "Read failed", code: "42501" } : rows : []), {
        status: candidates && fail ? 403 : 200, headers: { "Content-Type": "application/json" },
      });
    } },
  });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: { id: "admin", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }, error: null });
  mocks.createClient.mockResolvedValue(client);
  return queries;
}

describe("Candidate interviews in Calendar", () => {
  beforeEach(() => { mocks.role = "admin"; });

  it("projects existing CRM interview dates and provides available candidate choices", async () => {
    const queries = setup([cycle, { ...cycle, id: "unscheduled", interview_at: null }, { ...cycle, id: "outside", interview_at: "2027-01-01T10:00:00Z" }]);
    const data = await getCalendarData({ start: "2026-11-16", end: "2026-11-22" });
    expect(data?.items).toEqual([expect.objectContaining({ source: "crm_interview", id: "cycle", candidateId: "candidate", startsAt: cycle.interview_at, endsAt: cycle.interview_at, personIds: ["admin"] })]);
    expect(data?.interviewCandidates).toHaveLength(3);
    const query = queries.find((url) => url.pathname.endsWith("/crm_recruiting_cycles"));
    expect(query?.searchParams.get("studio_id")).toBe("eq.studio");
  });

  it("suppresses reminders with a live event and retains closed cycles only as history", async () => {
    setup([{ ...cycle, events: [{ id: "event", cancelled_at: null }] }, { ...cycle, id: "closed", outcome: "reserve" }]);
    const data = await getCalendarData({ start: "2026-11-16", end: "2026-11-22" });
    expect(data?.items.map((item) => item.id)).toEqual(["closed"]);
    expect(data?.interviewCandidates).toEqual([expect.objectContaining({ id: "cycle", eventId: "event" })]);
  });

  it("never requests candidate data for employees", async () => {
    mocks.role = "employee";
    const queries = setup([cycle]);
    const data = await getCalendarData({ start: "2026-11-16", end: "2026-11-22" });
    expect(queries.some((url) => url.pathname.includes("crm_"))).toBe(false);
    expect(data?.interviewCandidates).toEqual([]);
    expect(data?.items).toEqual([]);
  });

  it("preserves read failures instead of silently omitting interviews", async () => {
    setup([], true);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(getCalendarData({ start: "2026-11-16", end: "2026-11-22" })).rejects.toThrow("Unable to load Calendar data.");
    } finally { log.mockRestore(); }
  });

  it("renders start-only reminders at midnight, honors filters, and replaces them with linked events", async () => {
    const reminder: Extract<CalendarItem, { source: "crm_interview" }> = {
      source: "crm_interview", key: "crm_interview:cycle", id: "cycle", candidateId: "candidate", title: "Candidate",
      allDay: false, startsAt: "2026-11-15T22:00:00Z", endsAt: "2026-11-15T22:00:00Z",
      startDate: "2026-11-16", endDate: "2026-11-16", projectId: null, personIds: ["admin"], responsibleAdminId: "admin",
    };
    expect(getTimedWeekSegments([reminder], ["2026-11-16"])).toEqual([expect.objectContaining({ startMinute: 0, endMinute: 1 })]);
    expect(getTimedWeekSegments([reminder], ["2026-11-15"], "America/New_York")).toEqual([expect.objectContaining({ startMinute: 17 * 60, endMinute: 17 * 60 + 1 })]);
    expect(filterCalendarItems([reminder], { ...DEFAULT_CALENDAR_FILTERS, events: false }, "admin")).toEqual([]);
    expect(filterCalendarItems([reminder], { ...DEFAULT_CALENDAR_FILTERS, mine: true }, "other")).toEqual([]);
    const event: Extract<CalendarItem, { source: "calendar_event" }> = {
      ...reminder, source: "calendar_event", key: "calendar_event:event", id: "event", recruitingCycleId: "cycle",
      eventType: "interview", description: null, location: null, meetingUrl: null, meetingMode: null,
      project: null, organizer: { id: "admin", full_name: "Admin", job_title: "Admin", avatar_url: null, projectIds: [] },
      invitees: [], participants: [], endsAt: "2026-11-15T23:00:00Z",
    };
    expect(mergeCalendarItem([reminder], event)).toEqual([event]);
  });
});
