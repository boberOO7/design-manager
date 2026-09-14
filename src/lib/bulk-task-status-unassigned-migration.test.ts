import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260913212445_align_bulk_task_status_unassigned_semantics.sql", import.meta.url);

describe("bulk task status unassigned semantics migration", () => {
  it("exempts only unassigned work from attribution membership validation", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const assigneeGuard = sql.indexOf("task.assignee_id is not null");
    const membershipGuard = sql.indexOf("not exists (", assigneeGuard);

    expect(assigneeGuard).toBeGreaterThan(-1);
    expect(membershipGuard).toBeGreaterThan(assigneeGuard);
    expect(sql).toContain("member.is_active and studio_member.is_active and profile.is_active");
    expect(sql).toContain("private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)");
    expect(sql).toContain("Complete every checklist item before moving this batch to Done");
    expect(sql).toContain("Choose a status enabled for this task stage");
    expect(sql).toContain("security invoker");
  });
});
