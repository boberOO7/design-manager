import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260729200758_project_activity_history.sql", import.meta.url);

describe("project activity migration contract", () => {
  it("makes Activity History immutable and project-readable only", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("alter column actor_id drop not null");
    expect(sql).toContain("revoke all on table public.project_activity from anon, authenticated");
    expect(sql).toContain("grant select on table public.project_activity to authenticated");
    expect(sql).toContain("project_activity_select_for_authorized_project_users");
    expect(sql).toContain("private.can_access_project(project_id)");
  });

  it("records only supported mutations, in source transactions, with authenticated actors", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("(select auth.uid())");
    expect(sql).toContain("log_project_activity_after_update");
    expect(sql).toContain("log_task_activity_after_insert_or_update");
    expect(sql).toContain("log_project_member_activity_after_change");
    expect(sql).toContain("new.status is distinct from old.status");
    expect(sql).not.toContain("jsonb_build_object('description'");
    expect(sql).not.toContain("jsonb_build_object('title'");
  });

  it("uses private fixed-search-path trigger helpers and preserves lifecycle attribution", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("project_lifecycle_changed");
    expect(sql).toContain("task_updated");
    expect(sql).toContain("revoke execute on function private.record_project_activity");
  });
});
