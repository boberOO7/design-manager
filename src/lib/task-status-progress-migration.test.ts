import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260828110000_fix_first_pass_task_progress.sql", import.meta.url);

describe("task status-derived progress migration", () => {
  it("persists zero for a first pass and retains the rework value in the shared task trigger", async () => {
    const source = await readFile(migrationPath, "utf8");

    expect(source).toContain("when old.status in ('internal_review', 'review', 'completed') then 70");
    expect(source).toContain("else 0");
    expect(source).toContain("new.status = 'in_progress'");
  });

  it("keeps the bulk RPC on the same row-level trigger path", async () => {
    const bulkMigration = await readFile(new URL("../../supabase/migrations/20260821110000_bulk_task_status_moves.sql", import.meta.url), "utf8");

    expect(bulkMigration).toContain("update public.tasks as task");
    expect(bulkMigration).toContain("set status = p_target_status");
  });
});
