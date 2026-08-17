import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260817143113_time_off_multi_admin_approvals.sql"), "utf8");

describe("time-off multi-admin approval migration", () => {
  it("persists one approval per request and active admin", () => {
    expect(migration).toContain("create table public.time_off_request_approvals");
    expect(migration).toContain("primary key (request_id, admin_user_id)");
    expect(migration).toContain("member.system_role = 'admin'");
    expect(migration).toContain("member.is_active = true");
  });

  it("enforces approval thresholds atomically and resolves pending admin notifications", () => {
    expect(migration).toContain("create or replace function public.approve_time_off_request(");
    expect(migration).toContain("for update;");
    expect(migration).toContain("case when target.request_type = 'vacation' then 2 else 1 end");
    expect(migration).toContain("on conflict (request_id, admin_user_id) do nothing");
    expect(migration).toContain("You have already approved this time-off request");
    expect(migration).toContain("notification_type = 'time_off_request_submitted'");
  });

  it("immediately approves self-created requests from active administrators without approval rows", () => {
    expect(migration).toContain("create or replace function private.initialize_time_off_request_status()");
    expect(migration).toContain("if coalesce(private.is_studio_admin(new.studio_id), false) then");
    expect(migration).toContain("new.status := 'approved'");
    expect(migration).toContain("Administrator time-off requests must be approved by their creator");
  });
});
