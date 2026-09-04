import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260903190137_contractor_category_management.sql", import.meta.url);

describe("contractor category management migration", () => {
  it("restricts rename and delete RPCs to the active studio administrator", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const functionName of ["rename_contractor_category", "delete_contractor_category"]) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${functionName}`);
      expect(sql).toContain(`grant execute on function public.${functionName}`);
    }
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("member.user_id = auth.uid() and member.is_active");
    expect(sql).toContain("v_roles[1] <> 'admin'");
  });

  it("renames the canonical record without changing its color", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const renameRpc = sql.slice(sql.indexOf("create or replace function public.rename_contractor_category"), sql.indexOf("create or replace function public.delete_contractor_category"));

    expect(renameRpc).toContain("set name = btrim(p_name)");
    expect(renameRpc).toContain("lower(btrim(category.name)) = lower(btrim(p_name))");
    expect(renameRpc).toContain("contractor_category_name_taken");
    expect(renameRpc).not.toContain("color_key =");
  });

  it("blocks referenced categories and never deletes contractors", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const deleteRpc = sql.slice(sql.indexOf("create or replace function public.delete_contractor_category"));

    expect(deleteRpc).toContain("contractor.category_id = p_category_id");
    expect(deleteRpc).toContain("contractor_category_in_use");
    expect(deleteRpc).toContain("when foreign_key_violation");
    expect(deleteRpc).toContain("delete from public.contractor_categories");
    expect(deleteRpc).not.toContain("delete from public.contractors");
  });
});
