import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728153858_calendar_foundation.sql"), "utf8");

function functionSql(name: string, nextMarker: string): string {
  return migration.slice(
    migration.indexOf(`create or replace function ${name}`),
    migration.indexOf(nextMarker, migration.indexOf(`create or replace function ${name}`)),
  );
}

describe("Calendar migration security contract", () => {
  it("enables RLS on every new table", () => {
    for (const table of ["calendar_events", "calendar_event_attendees", "time_off_requests"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("keeps deadlines out of the manual event table", () => {
    const eventTable = migration.slice(migration.indexOf("create table public.calendar_events"), migration.indexOf("create table public.calendar_event_attendees"));
    expect(eventTable).not.toContain("due_date");
  });

  it("exposes coworker availability only through an approved generic projection", () => {
    const rpc = migration.slice(migration.indexOf("create or replace function public.get_calendar_coworker_availability"));
    expect(rpc).toContain("request.status = 'approved'");
    expect(rpc).toContain("'Out of office'::text");
    expect(rpc).not.toContain("private_note");
    expect(rpc).not.toContain("review_note");
    expect(rpc).toContain("revoke execute on function public.get_calendar_coworker_availability(uuid, date, date)");
  });

  it("prevents a cancelled event from being restored", () => {
    const sql = functionSql("private.validate_calendar_event()", "revoke execute on function private.validate_calendar_event()");
    expect(sql).toContain("if old.cancelled_at is not null then");
    expect(sql).toContain("raise exception 'Cancelled events are read-only'");
  });

  it("prevents a cancelled event from being edited and keeps cancellation change-only", () => {
    const sql = functionSql("private.validate_calendar_event()", "revoke execute on function private.validate_calendar_event()");
    expect(sql).toContain("if new.cancelled_at is not null then");
    expect(sql).toContain("raise exception 'Cancelling an event cannot change event details'");
    expect(sql.indexOf("return new;")).toBeLessThan(sql.indexOf("select project.studio_id, project.status"));
  });

  it("prevents attendee changes after cancellation", () => {
    const sql = functionSql("private.validate_calendar_event_attendee()", "revoke execute on function private.validate_calendar_event_attendee()");
    expect(sql).toContain("if target_event.cancelled_at is not null then");
    expect(sql).toContain("raise exception 'Cancelled event attendees are read-only'");
    expect(migration).toContain("before insert or update or delete on public.calendar_event_attendees");
    const manageSql = functionSql("private.can_manage_calendar_event(target_event_id uuid)", "revoke execute on function private.can_manage_calendar_event(uuid)");
    expect(manageSql).toContain("event.cancelled_at is null");
  });

  it("allows completed or archived project events to be cancelled but not edited", () => {
    const sql = functionSql("private.validate_calendar_event()", "revoke execute on function private.validate_calendar_event()");
    expect(sql).toContain("project_status not in ('planned', 'active', 'paused')");
    expect(sql).toContain("raise exception 'Events on completed or archived projects may only be cancelled'");
    expect(sql.indexOf("return new;")).toBeLessThan(sql.indexOf("project_status not in"));
  });

  it("makes reviewed requests immutable except for admin cancellation", () => {
    const sql = functionSql("private.validate_time_off_request()", "revoke execute on function private.validate_time_off_request()");
    expect(sql).toContain("if old.status in ('approved', 'rejected') then");
    expect(sql).toContain("if new.status = old.status then");
    expect(sql).toContain("raise exception 'Reviewed time-off requests are read-only'");
    expect(sql).toContain("if not actor_is_admin or new.status <> 'cancelled' then");
  });

  it("preserves request and review metadata when cancelling a reviewed request", () => {
    const sql = functionSql("private.validate_time_off_request()", "revoke execute on function private.validate_time_off_request()");
    for (const field of ["request_type", "start_date", "end_date", "start_time", "end_time", "all_day", "private_note", "reviewed_by", "reviewed_at", "review_note"]) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    }
    expect(sql).toContain("raise exception 'Cancelling a reviewed request must preserve request and review details'");
  });

  it("makes cancelled requests fully immutable", () => {
    const sql = functionSql("private.validate_time_off_request()", "revoke execute on function private.validate_time_off_request()");
    expect(sql).toContain("if old.status = 'cancelled' then");
    expect(sql).toContain("raise exception 'Cancelled time-off requests are read-only'");
  });

  it("scopes coworker availability to the explicitly requested studio", () => {
    const rpc = migration.slice(migration.indexOf("create or replace function public.get_calendar_coworker_availability"));
    expect(rpc).toContain("target_studio_id uuid");
    expect(rpc).toContain("private.is_studio_member(target_studio_id)");
    expect(rpc).toContain("request.studio_id = target_studio_id");
    expect(rpc).not.toContain("private.is_studio_member(request.studio_id)");
  });

  it("fixes the search path and revokes direct execution for trigger functions", () => {
    for (const name of ["validate_calendar_event", "validate_calendar_event_attendee", "validate_time_off_request"]) {
      const functionSql = migration.slice(migration.indexOf(`create or replace function private.${name}()`));
      expect(functionSql.slice(0, 250)).toContain("set search_path = ''");
      expect(migration).toContain(`revoke execute on function private.${name}()`);
    }
  });

  it("does not introduce service-role access or broad anonymous grants", () => {
    expect(migration).not.toContain("service_role");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|execute)[\s\S]{0,120}\sto anon/i);
  });
});
