import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260916190927_apply_project_template_stage.sql", import.meta.url);

describe("project template stage application migration", () => {
  it("shares the ordered normalized task copy path with full-template creation", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("create or replace function private.copy_project_template_stage_tasks");
    expect(sql).toContain("order by template_task.position, template_task.id");
    expect(sql).toContain("template_task.title,\n    'normal'");
    expect(sql.match(/private\.copy_project_template_stage_tasks\(/g)).toHaveLength(4);
  });

  it("keeps stage application append-only, studio-scoped, and admin-only", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.apply_project_template_stage");
    expect(sql).toContain("private.is_studio_admin(project_studio_id)");
    expect(sql).toContain("template_studio_id <> project_studio_id");
    expect(sql).toContain("stage_columns.is_enabled");
    expect(sql).toContain("'todo' = any(stage_columns.enabled_statuses)");
    expect(sql).not.toContain("delete from public.tasks");
    expect(sql).toContain("grant execute on function public.apply_project_template_stage(uuid, uuid, text, text)\nto authenticated;");
    expect(sql).toContain("revoke execute on function private.copy_project_template_stage_tasks(uuid, uuid, text, text, uuid)\nfrom public, anon, authenticated;");
  });
});
