import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728171129_calendar_event_and_time_off_fixes.sql"), "utf8");

describe("Calendar event and time-off patch migration", () => {
  it("enforces Kyiv-midnight bounds for all-day events while preserving cancellation", () => {
    expect(migration).toContain("new.starts_at at time zone 'Europe/Kyiv'");
    expect(migration).toContain("new.ends_at at time zone 'Europe/Kyiv'");
    expect(migration).toContain("if tg_op = 'UPDATE' and new.cancelled_at is not null then");
  });

  it("forces every inserted time-off request to belong to auth.uid", () => {
    expect(migration).toContain("if new.user_id is distinct from actor_id then");
    expect(migration).toContain("raise exception 'Time-off requests must belong to the authenticated user'");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("create policy time_off_requests_insert_own");
  });

  it("starts an employee self-request pending and unreviewed", () => {
    expect(migration).toContain("else\n    new.status := 'pending'");
    expect(migration).toContain("new.reviewed_by := null");
    expect(migration).toContain("new.reviewed_at := null");
  });

  it("auto-approves only an active admin's own request in a BEFORE INSERT trigger", () => {
    expect(migration).toContain("create trigger initialize_time_off_request_status_before_insert");
    expect(migration).toContain("before insert on public.time_off_requests");
    expect(migration).toContain("if private.is_studio_admin(new.studio_id) then");
    expect(migration).toContain("new.status := 'approved'");
    expect(migration).toContain("new.reviewed_by := actor_id");
    expect(migration).toContain("new.status := 'pending'");
  });

  it("leaves the privacy-safe coworker availability RPC unchanged", () => {
    expect(migration).not.toContain("get_calendar_coworker_availability");
  });

  it("makes cancellation terminal and rejects cancelled event edits", () => {
    expect(migration).toContain("if old.cancelled_at is not null then\n      raise exception 'Cancelled events are read-only'");
    expect(migration).toContain("if new.cancelled_at is not null then");
    expect(migration).toContain("raise exception 'Cancelling an event cannot change event details'");
  });

  it("permits only cancellation for completed or archived project events", () => {
    expect(migration).toContain("if project_status not in ('planned', 'active', 'paused') then");
    expect(migration).toContain("if old.project_id is not null then");
    expect(migration).toContain("if project_status is null or project_status not in ('planned', 'active', 'paused') then");
    expect(migration).toContain("raise exception 'Events on completed or archived projects may only be cancelled'");
    expect(migration).toContain("if new.cancelled_at is not null then");
  });

  it("blocks attendee additions and removals for cancelled or inactive-project events", () => {
    expect(migration).toContain("and event.cancelled_at is null");
    expect(migration).toContain("raise exception 'Cancelled event attendees are read-only'");
    expect(migration).toContain("raise exception 'Attendees on completed or archived project events are read-only'");
  });

  it("keeps active studio-wide events manageable", () => {
    expect(migration).toContain("event.project_id is null or project.status in ('planned', 'active', 'paused')");
    expect(migration).toContain("if new.project_id is not null then");
  });
});
