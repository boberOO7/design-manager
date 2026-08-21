import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260821100000_stage_progress_methods.sql", import.meta.url);

describe("stage progress migration contract", () => {
  it("moves legacy project methods onto the stage configuration rows", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column progress_method text not null default 'equal'");
    expect(sql).toContain("set progress_method = projects.progress_method");
    expect(sql).toContain("alter table public.projects drop column progress_method");
  });

  it("keeps stage-local area validation and removes the project-level trigger", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("private.validate_task_stage_area_allocation");
    expect(sql).toContain("stage_columns.progress_method = 'area'");
    expect(sql).toContain("drop trigger if exists validate_project_progress_settings_before_update");
  });
});
