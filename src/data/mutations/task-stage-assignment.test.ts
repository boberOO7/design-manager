import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../../supabase/migrations/20260821120000_bulk_task_stage_assignment.sql", import.meta.url);
const mutationPath = new URL("./task-status.ts", import.meta.url);

describe("bulk task stage assignment contract", () => {
  it("uses the atomic assignment RPC and leaves task triggers authoritative", async () => {
    const [migration, mutation] = await Promise.all([readFile(migrationPath, "utf8"), readFile(mutationPath, "utf8")]);

    expect(migration).toContain("bulk_assign_project_stage_tasks");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("for update");
    expect(migration).toContain("task.status <> 'cancelled'");
    expect(migration).toContain("private.is_studio_admin");
    expect(mutation).toContain('supabase.rpc("bulk_assign_project_stage_tasks"');
  });
});
