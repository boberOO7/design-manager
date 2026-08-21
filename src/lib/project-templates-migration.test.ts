import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260821130000_project_templates.sql", import.meta.url);

describe("project template migration", () => {
  it("keeps templates studio-scoped, ordered, and limited to one active type", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create table public.project_templates");
    expect(sql).toContain("create table public.project_template_tasks");
    expect(sql).toContain("unique (template_id, stage, position)");
    expect(sql).toContain("project_templates_one_active_type_per_studio");
    expect(sql).toContain("where is_active");
    expect(sql).toContain("project_template_tasks_deterministic_order");
  });

  it("keeps direct template access read-only and puts admin authorization in RPCs", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("grant select on public.project_templates, public.project_template_tasks to authenticated;");
    expect(sql).not.toContain("grant insert on public.project_templates");
    expect(sql).toContain("Only studio administrators can manage project templates");
    expect(sql).toContain("private.is_studio_member(studio_id)");
  });

  it("creates the project, memberships, and copied stage tasks in one database function", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create_project_from_template(p_project jsonb, p_stage_assignees jsonb");
    expect(sql).toContain("insert into public.project_members");
    expect(sql).toContain("on conflict (project_id, user_id) where is_active do nothing");
    expect(sql).toContain("insert into public.tasks");
    expect(sql).toContain("order by task.stage, task.position, task.id");
    expect(sql).toContain("A selected assignee is not an active studio member");
    expect(sql).toContain("if matched_template_id is null then return new_project_id; end if;");
  });
});
