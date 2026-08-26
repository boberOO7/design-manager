import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260821140000_project_template_defaults.sql", import.meta.url);

describe("project template defaults migration", () => {
  it("allows multiple active templates but only one default per studio and type", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column is_default boolean");
    expect(sql).toContain("drop index if exists public.project_templates_one_active_type_per_studio");
    expect(sql).toContain("project_templates_one_default_type_per_studio");
    expect(sql).toContain("where is_default");
  });

  it("allows no default while keeping non-default templates active and usable", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("if p_is_default and not p_is_active then");
    expect(sql).toContain("where id=p_template_id and studio_id=p_studio_id returning id into saved_template_id");
    expect(sql).not.toContain("if not p_is_default then raise exception");
  });

  it("accepts an explicitly selected active matching template atomically", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("p_template_id uuid default null");
    expect(sql).toContain("studio_id=current_studio_id and project_type=project_type_value and is_active");
    expect(sql).toContain("Choose an active template matching this project type");
    expect(sql).toContain("if selected_template_id is null then return new_project_id; end if;");
  });
});
