import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/calendar/events/route.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820120000_create_calendar_event_with_invites.sql"), "utf8");
const organizerAuthorizationMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820140000_calendar_event_organizer_authorization.sql"), "utf8");
const canonicalEventTypeMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260830183617_fix_calendar_event_type_legacy_enum_references.sql"), "utf8");
const interviewMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260829220311_specialize_interview_calendar_events.sql"), "utf8");
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
    expect(organizerAuthorizationMigration).toContain("calendar_events_insert_organizer_or_admin");
    expect(organizerAuthorizationMigration).toContain("created_by = (select auth.uid())");
    expect(organizerAuthorizationMigration).toContain("organizer_id = (select auth.uid())");
    expect(organizerAuthorizationMigration).toContain("private.is_studio_member(studio_id)");
    expect(organizerAuthorizationMigration).toContain("project_id is null");
    expect(organizerAuthorizationMigration).toContain("project.studio_id = calendar_events.studio_id");
    expect(organizerAuthorizationMigration).toContain("private.can_access_project(project.id)");
  });

  it("allows organizers and administrators to manage invitations, but not invitees", () => {
    expect(organizerAuthorizationMigration).toContain("private.is_studio_admin(event.studio_id) or event.organizer_id = (select auth.uid())");
    expect(organizerAuthorizationMigration).toContain("calendar_event_invites_insert_organizer_or_admin");
    expect(organizerAuthorizationMigration).toContain("calendar_event_invites_delete_organizer_or_admin");
    expect(organizerAuthorizationMigration).toContain("Only the invited user may change their RSVP");
  });

  it("passes the explicit meeting mode to the current RPC, whose persistence normalizes non-meetings to null", () => {
    expect(route).toContain("p_meeting_mode: payload.meeting_mode");
    expect(canonicalEventTypeMigration).toContain("case when p_event_type in ('meeting', 'presentation') then coalesce(p_meeting_mode, 'offline') else null end");
    expect(canonicalEventTypeMigration).not.toContain("client_presentation");
  });

  it("keeps interviews out of the invitation flow while persisting the selected interviewer as an assignee", () => {
    expect(route).toContain('parsed.data.eventType === "interview"');
    expect(route).toContain('attendeeIds: [], participantIds: [], location: null');
    expect(interviewMigration).toContain("elsif p_event_type not in ('site_visit', 'interview') then");
    expect(interviewMigration).toContain("if event_row.event_type = 'interview' then raise exception 'Interviews do not use invitations'; end if;");
  });
});
