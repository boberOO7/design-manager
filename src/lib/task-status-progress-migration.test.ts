import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260826120000_task_status_derived_progress.sql", import.meta.url);

describe("task status-derived progress migration", () => {
  it("persists automatic first-pass and rework values in the shared task trigger", async () => {
    const source = await readFile(migrationPath, "utf8");

    expect(source).toContain("add column manual_progress_override boolean not null default false");
    expect(source).toContain("when old.status in ('internal_review', 'review', 'completed') then 70");
    expect(source).toContain("else 50");
    expect(source).toContain("new.status = 'in_progress'");
  });

  it("keeps the bulk RPC on the same row-level trigger path", async () => {
    const bulkMigration = await readFile(new URL("../../supabase/migrations/20260821110000_bulk_task_status_moves.sql", import.meta.url), "utf8");

    expect(bulkMigration).toContain("update public.tasks as task");
    expect(bulkMigration).toContain("set status = p_target_status");
  });
});
