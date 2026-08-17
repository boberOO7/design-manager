import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260817204341_allow_unassigned_project_tasks.sql", import.meta.url);

describe("unassigned project task migration", () => {
  it("allows administrators to create and clear an optional assignee while validating selected members", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("target_assignee_id is null");
    expect(sql).toContain("Task assignee must be an active project member");
    expect(sql).not.toContain("Active project tasks cannot be manually unassigned");
  });
});
