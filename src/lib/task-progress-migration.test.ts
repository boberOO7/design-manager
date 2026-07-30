import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260730120100_task_progress_checklists.sql", import.meta.url);

describe("task progress migration contract", () => {
  it("backfills equal progress and constrains all new numeric settings", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("progress_method text not null default 'equal'");
    expect(sql).toContain("progress_method in ('equal', 'area', 'weighted')");
    expect(sql).toContain("production_completion >= 0 and production_completion <= 100");
    expect(sql).toContain("progress_weight > 0 and progress_weight <= 1000");
  });

  it("creates a lightweight ordered checklist with RLS-safe editor policies", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create table public.task_checklist_items");
    expect(sql).toContain("unique (task_id, position)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("max(item.position) + 1");
    expect(sql).toContain("alter table public.task_checklist_items enable row level security");
    expect(sql).toContain("grant update (title, is_completed, weight)");
    expect(sql).not.toContain("grant update (task_id");
    expect(sql).not.toContain("grant update (position");
    expect(sql).toContain("private.can_edit_task_checklist(task_id)");
    expect(sql).toContain("private.can_update_project_task_status(task.project_id, task.assignee_id)");
  });

  it("blocks incomplete review, normalizes production, and preserves review-to-progress production", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("new.status in ('review', 'completed')");
    expect(sql).toContain("and not item.is_completed");
    expect(sql).toContain("new.production_completion := 100");
    expect(sql).toContain("new.status <> 'in_progress'");
    expect(sql).toContain("status in ('todo', 'in_progress', 'review', 'completed')");
  });

  it("preserves the existing non-cancellable task mutation boundary", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("status in ('todo', 'in_progress', 'review', 'completed')");
    expect(sql).not.toContain("status in ('todo', 'in_progress', 'review', 'completed', 'cancelled')");
  });

  it("rejects missing or non-positive design scope before enabling area progress", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("if new.total_area_m2 is null or new.total_area_m2 <= 0 then");
    expect(sql).toContain("if scope_area is null or scope_area <= 0 then");
    expect(sql.match(/Area progress requires a positive project design-scope area/g)).toHaveLength(2);
  });

  it("serializes task and project area validation per affected project", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(3);
    expect(sql.match(/studioflow:task-area:/g)).toHaveLength(2);
    expect(sql).toContain("values (new.project_id), (old_project_id)");
    expect(sql).toContain("values (new.id), (old.id)");
    expect(sql.match(/order by affected\.project_id/g)).toHaveLength(3);
    expect(sql).toContain("task.id is distinct from new.id");
  });

  it("enforces design-scope area coverage without mixing area and explicit weights", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("allocated_area > scope_area");
    expect(sql).toContain("task.status <> 'cancelled'");
    expect(sql).toContain("Task area allocation cannot exceed the project design-scope area");
  });
});
