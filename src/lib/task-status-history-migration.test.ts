import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260922194947_task_status_history.sql", import.meta.url);

describe("task status history migration contract", () => {
  it("records distinct task status periods atomically and keeps them read-only", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("new.status is not distinct from old.status");
    expect(sql).toContain("after update of status on public.tasks");
    expect(sql).toContain("where task_id = new.id and exited_at is null");
    expect(sql).toContain("grant select on table public.task_status_periods to authenticated");
    expect(sql).toContain("private.can_access_project(project_id)");
  });

  it("backfills only chained authoritative activity timestamps", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("from public.project_activity as activity");
    expect(sql).toContain("event.from_status = event.previous_status");
    expect(sql).toContain("event.entered_at = event.previous_entered_at");
    expect(sql).not.toContain("task.created_at as entered_at");
    expect(sql).not.toContain("task.updated_at as entered_at");
  });
});
