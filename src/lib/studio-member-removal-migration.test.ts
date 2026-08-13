import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260813143000_per_task_studio_member_removal.sql", import.meta.url);

describe("per-task studio member removal migration", () => {
  it("keeps removal atomic while validating every task-level replacement", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("p_reassignments jsonb,");
    expect(sql).toContain("p_allow_unassigned boolean");
    expect(sql).toContain("Every open task requires an eligible reassignment");
    expect(sql).toContain("A replacement must be an active member of that task’s project");
    expect(sql).toContain("update public.tasks t set assignee_id = r.assignee_id");
    expect(sql).toContain("update public.tasks t set assignee_id = null");
    expect(sql).toContain("t.status not in ('completed', 'cancelled')");
    expect(sql).toContain("update public.project_members pm set is_active = false");
  });

  it("serializes assignment and replacement removal on membership rows", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("studio_members_one_active_studio_per_user");
    expect(sql).toContain("create or replace function private.lock_and_validate_task_assignee");
    expect(sql).toContain("for share of pm, sm, pr");
    expect(sql).toContain("create trigger enforce_task_assignee_membership_before_write");
    expect(sql).toContain("create trigger prevent_open_task_project_member_removal_before_write");
    expect(sql).toContain("create trigger enforce_project_member_studio_membership_before_write");
    expect(sql).toContain("studio_member_removal_unassignment_permits");
    expect(sql).toContain("Hold the replacement memberships through the task updates");
    expect(sql).toContain("create or replace function public.remove_studio_member(p_user_id uuid, p_reassignment_user_id uuid default null)");
    expect(sql).not.toContain("drop function public.remove_studio_member(uuid, uuid);");
  });

  it("limits nullable assignments to the removal path", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("Active project tasks cannot be manually unassigned");
    expect(sql).toContain("lets only the removal RPC clear open-task assignees");
  });
});
