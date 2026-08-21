import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260821160000_normalize_project_template_task_priority.sql", import.meta.url);

describe("project template task priority migration", () => {
  it("normalizes generated task priority instead of reading stale template values", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("t.title,'normal',a.assignee_id");
    expect(sql).not.toContain("t.title,t.priority,a.assignee_id");
  });
});
