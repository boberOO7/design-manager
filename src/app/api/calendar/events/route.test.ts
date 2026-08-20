import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/calendar/events/route.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820120000_create_calendar_event_with_invites.sql"), "utf8");
const insertPolicyMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820130000_fix_calendar_event_insert_policy.sql"), "utf8");
const invitationMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260819110000_calendar_event_invitations.sql"), "utf8");
const eventDetailsQuery = readFileSync(resolve(process.cwd(), "src/data/queries/calendar-item.ts"), "utf8");

describe("Calendar event creation persistence contract", () => {
  it("submits selected attendee IDs to the atomic event-and-invites RPC", () => {
    expect(route).toContain('rpc("create_calendar_event_with_invites"');
    expect(route).toContain("p_attendee_ids: value.attendeeIds");
  });

  it("does not retain a development-only event insert path that skips invitations", () => {
    expect(route).not.toContain("plainInsertDiagnostic");
    expect(route).not.toContain("requiresRefresh");
  });

  it("creates pending invite rows in the same transaction as the event", () => {
    expect(migration).toContain("create function public.create_calendar_event_with_invites");
    expect(migration).toContain("insert into public.calendar_event_invites");
    expect(migration).toContain("'pending'::public.calendar_event_invitation_status");
    expect(migration).toContain("select distinct attendee_id");
    expect(migration).toContain("returns uuid");
  });

  it("reloads event details from persisted invitation rows with profile and RSVP data", () => {
    expect(eventDetailsQuery).toContain("invitees:calendar_event_invites(id, user_id, status");
    expect(eventDetailsQuery).toContain("profile:profiles!calendar_event_invites_user_id_fkey");
  });

  it("keeps the event insert policy scoped to its authenticated organizer and studio/project context", () => {
    expect(insertPolicyMigration).toContain("drop policy if exists calendar_events_insert_admin");
    expect(insertPolicyMigration).toContain("grant insert (organizer_id) on table public.calendar_events to authenticated");
    expect(insertPolicyMigration).toContain("created_by = (select auth.uid())");
    expect(insertPolicyMigration).toContain("organizer_id = (select auth.uid())");
    expect(insertPolicyMigration).toContain("private.is_studio_admin(studio_id)");
    expect(insertPolicyMigration).toContain("project_id is null");
    expect(insertPolicyMigration).toContain("project.studio_id = calendar_events.studio_id");
    expect(insertPolicyMigration).toContain("private.can_access_project(project.id)");
  });

  it("relies on the existing invite insert policy after the event exists in the transaction", () => {
    expect(invitationMigration).toContain("create policy calendar_event_invites_insert_admin");
    expect(invitationMigration).toContain("with check ((select private.can_manage_calendar_event(event_id)))");
  });
});
