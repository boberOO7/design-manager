import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260818140000_add_contractor_subcategories.sql", import.meta.url);

describe("contractor subcategories migration", () => {
  it("stores normalized subcategories under their category without color data", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create table public.contractor_subcategories");
    expect(sql).toContain("on public.contractor_subcategories (category_id, lower(btrim(name)))");
    expect(sql).not.toContain("color_key");
  });

  it("keeps contractor subcategories optional but enforces the selected parent category", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column subcategory_id uuid;");
    expect(sql).toContain("foreign key (subcategory_id, category_id)");
    expect(sql).toContain("references public.contractor_subcategories (id, category_id)");
  });

  it("inherits active-studio visibility and resolves subcategories through an authenticated RPC", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("contractor_subcategories_select_for_active_studio_members");
    expect(sql).toContain("member.studio_id = category.studio_id");
    expect(sql).toContain("function public.resolve_contractor_subcategory(p_category_id uuid, p_name text)");
    expect(sql).toContain("where id = p_category_id and studio_id = v_studio_id");
    expect(sql).toContain("grant execute on function public.resolve_contractor_subcategory(uuid, text) to authenticated");
  });
});
