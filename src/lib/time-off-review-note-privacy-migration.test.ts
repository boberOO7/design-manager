import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260910112451_review_note_privacy.sql"), "utf8");

describe("time-off review-note privacy migration", () => {
  it("stores review notes in an admin-RLS table rather than the employee-readable request row", () => {
    expect(migration).toContain("create table public.time_off_request_reviews");
    expect(migration).toContain("alter table public.time_off_request_reviews enable row level security;");
    expect(migration).toContain('create policy "time_off_request_reviews_select_for_active_admin"');
    expect(migration).toContain("private.is_studio_admin(request.studio_id)");
    expect(migration).toContain("alter table public.time_off_requests drop column review_note;");
  });

  it("enforces sick-leave reasons in the write trigger and uses guarded review RPCs", () => {
    expect(migration).toContain("new.request_type in ('day_off', 'sick_leave', 'other')");
    expect(migration).toContain("create function public.reject_time_off_request(");
    expect(migration).toContain("revoke execute on function public.reject_time_off_request(uuid, text) from public, anon;");
  });
});
