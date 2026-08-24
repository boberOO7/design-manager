import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260824100000_allow_unassigned_area_task_completion.sql", import.meta.url);

describe("unassigned area task completion migration contract", () => {
  it("does not create employee attribution when an area task has no assignee", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("new.completed_area_m2 is null or new.assignee_id is null");
    expect(sql).toContain("return new");
    expect(sql).toContain("Attributed task completion requires an active project-member assignee");
  });

  it("allows bulk completion of unassigned area tasks while retaining bulk transition protections", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("task.assignee_id is not null");
    expect(sql).toContain("private.can_update_project_task_status(task.project_id, task.assignee_id)");
    expect(sql).toContain("Complete every checklist item before moving this batch to Done");
    expect(sql).toContain("Choose a status enabled for this task stage");
  });
});
