import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260802192102_studio_checklist_templates.sql", import.meta.url);

describe("studio checklist template migration", () => {
  it("seeds the existing presets once per studio with deterministic stages", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("create table public.checklist_templates");
    expect(source).toContain("create table public.checklist_template_items");
    expect(source).toContain(
      ") as preset(name)\non conflict do nothing;",
    );
    expect(source).not.toContain("on conflict (studio_id, name)");
    expect(source).toContain("('Interior design workflow')");
    expect(source).toContain("('Architectural workflow')");
    expect(source).toContain("position integer not null");
  });

  it("keeps direct table access read-only while admin RPCs save ordered stages atomically", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("grant select on public.checklist_templates, public.checklist_template_items to authenticated;");
    expect(source).not.toContain("grant insert, update on public.checklist_templates");
    expect(source).not.toContain("checklist_templates_insert_for_studio_admins");
    expect(source).not.toContain("checklist_template_items_write_for_studio_admins");
    expect(source).toContain("create or replace function public.save_checklist_template");
    expect(source).toContain("security definer");
    expect(source).toContain("Only studio administrators can save checklist templates");
    expect(source).toContain("jsonb_array_elements(p_stages) with ordinality");
    expect(source).toContain("item.ordinality - 1");
  });

  it("protects immutable ownership and normalizes names and stage titles", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain(
      "create unique index checklist_templates_studio_normalized_name_key\non public.checklist_templates(studio_id, lower(btrim(name)));",
    );
    expect(source).toContain("normalized_name text := btrim(p_name)");
    expect(source).toContain("btrim(item.title)");
    expect(source).toContain("A checklist template with this name already exists");
    expect(source).toContain("values (p_studio_id, normalized_name, auth.uid())");
    expect(source).not.toContain("grant insert, update on public.checklist_template_items");
  });

  it("limits archive and restore to the secure admin RPC", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("create or replace function public.set_checklist_template_archived");
    expect(source).toContain("Only studio administrators can archive checklist templates");
    expect(source).toContain("grant execute on function public.set_checklist_template_archived(uuid, boolean) to authenticated;");
  });
});
