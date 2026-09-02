import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCalendarEventRelevantToUser } from "@/lib/calendar";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260902140546_google_calendar_automatic_reconciliation.sql");
const sync = read("src/lib/google-calendar/sync.ts");
const queue = read("src/lib/google-calendar/queue.ts");
const createRoute = read("src/app/api/calendar/events/route.ts");
const eventRoute = read("src/app/api/calendar/events/[eventId]/route.ts");
const invitationRoute = read("src/app/api/calendar/invitations/[inviteId]/route.ts");
const cronRoute = read("src/app/api/integrations/google-calendar/reconcile/route.ts");
const grantMigration = read("supabase/migrations/20260902160423_grant_google_reconciliation_calendar_reads.sql");

describe("automatic Google Calendar reconciliation", () => {
  it("uses the exact Calendar business-relevance predicate for every event type", () => {
    const base = { organizerId: "organizer", assigneeId: null, inviteeIds: ["invitee"], participantIds: ["participant"] };

    expect(isCalendarEventRelevantToUser({ ...base, eventType: "general" }, "organizer")).toBe(false);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "general" }, "invitee")).toBe(true);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "meeting" }, "organizer")).toBe(true);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "business_trip" }, "participant")).toBe(true);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "business_trip" }, "organizer")).toBe(false);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "site_visit", assigneeId: "assignee" }, "assignee")).toBe(true);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "interview", assigneeId: "assignee" }, "invitee")).toBe(false);
    expect(isCalendarEventRelevantToUser({ ...base, eventType: "work_makeup" }, "organizer")).toBe(true);
  });

  it("transactionally coalesces event, invitation, participant, and recurring occurrence changes", () => {
    expect(migration).toContain("source_event_id uuid primary key");
    expect(migration).toContain("on conflict (source_event_id) do update");
    expect(migration).toContain("revision = public.google_calendar_reconciliation_jobs.revision + 1");
    expect(migration).toContain("coalesce(event_row.series_id, event_row.id)");
    expect(migration).toContain("after insert or update or delete on public.calendar_events");
    expect(migration).toContain("after insert or update or delete on public.calendar_event_invites");
    expect(migration).toContain("after insert or update or delete on public.calendar_event_participants");
  });

  it("keeps the outbox private and claims jobs safely for only the server role", () => {
    expect(migration).toContain("alter table public.google_calendar_reconciliation_jobs enable row level security");
    expect(migration).toContain("revoke all on table public.google_calendar_reconciliation_jobs from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.google_calendar_reconciliation_jobs to service_role");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("grant execute on function public.claim_google_calendar_reconciliation_jobs(integer)");
    expect(migration).toContain("to service_role;");
  });

  it("grants the server-only worker the canonical relevance reads required by PostgREST", () => {
    expect(grantMigration).toContain("public.calendar_events");
    expect(grantMigration).toContain("public.calendar_event_invites");
    expect(grantMigration).toContain("public.calendar_event_participants");
    expect(grantMigration).toContain("to service_role");
    expect(grantMigration).not.toContain("to authenticated");
    expect(grantMigration).not.toContain("to anon");
  });

  it("shares projection logic between manual repair and event-scoped automatic reconciliation", () => {
    expect(sync).toContain("isCalendarEventRelevantToUser");
    expect(sync).toContain("buildProjections(events, connection.id, actor.user.id)");
    expect(sync).toContain("buildProjections(events, connection.id, connection.user_id)");
    expect(sync).toContain("root_source_event_id: projection.rootSourceEventId");
    expect(sync).toContain("events.update");
    expect(sync).toContain("events.delete");
    expect(sync).not.toContain("attendees:");
  });

  it("wakes work after successful mutations without making Google part of mutation success", () => {
    for (const route of [createRoute, eventRoute, invitationRoute]) {
      expect(route).toContain("scheduleGoogleCalendarReconciliation");
      expect(route).not.toContain("reconcileGoogleCalendarEvent");
      expect(route).not.toContain("googleapis");
    }
    expect(queue).toContain("after(async () =>");
    expect(queue).toContain("The durable job remains claimable");
  });

  it("uses bounded backoff and a protected scheduled drain", () => {
    expect(queue).toContain("const RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000]");
    expect(queue).toContain('status: exhausted ? "failed" : "pending"');
    expect(queue).toContain(".eq(\"revision\", job.revision)");
    expect(cronRoute).toContain("process.env.CRON_SECRET");
    expect(cronRoute).toContain("timingSafeEqual");
    expect(cronRoute).not.toContain("createClient");
  });
});
