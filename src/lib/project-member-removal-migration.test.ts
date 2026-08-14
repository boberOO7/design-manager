import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260814120000_project_member_removal_reassignment.sql", import.meta.url);

describe("project member removal reassignment migration", () => {
  it("atomically resolves only the current project's open work before removing membership", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("get_project_member_removal_impact(p_assignment_id uuid)");
    expect(sql).toContain("remove_project_member(p_assignment_id uuid, p_reassignments jsonb, p_allow_unassigned boolean)");
    expect(sql).toContain("t.project_id = v_project_id");
    expect(sql).toContain("Every open task requires an eligible reassignment");
    expect(sql).toContain("A replacement must be an active member of that task’s project");
    expect(sql).toContain("t.status not in ('completed', 'cancelled')");
    expect(sql).toContain("update public.project_members set is_active = false");
    expect(sql).not.toContain("update public.studio_members set is_active = false");
  });

  it("rejects nullable reassignment policy inputs instead of weakening the open-work invariant", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("p_reassignments is null or jsonb_typeof(p_reassignments) <> 'array'");
    expect(sql).toContain("if p_allow_unassigned is null then raise exception 'Allow-unassigned must be explicitly chosen'");
  });

  it("takes the conflicting membership lock used by task assignment before resolving open work", async () => {
    const [projectRemovalSql, taskAssignmentSql] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(new URL("../../supabase/migrations/20260813143000_per_task_studio_member_removal.sql", import.meta.url), "utf8"),
    ]);
    expect(projectRemovalSql).toContain("where pm.id = p_assignment_id and pm.is_active for update of pm");
    expect(taskAssignmentSql).toContain("for share of pm, sm, pr");
    expect(taskAssignmentSql).toContain("before insert or update of project_id, assignee_id on public.tasks");
    expect(taskAssignmentSql).toContain("Task assignee must be an active project member");
  });
});
