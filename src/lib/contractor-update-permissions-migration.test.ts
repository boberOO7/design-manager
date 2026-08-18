import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260818150000_allow_active_members_to_update_contractors.sql", import.meta.url);

describe("contractor update permissions migration", () => {
  it("allows active studio members to update only contractors in their studio", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('drop policy if exists "contractors_update_for_active_admins"');
    expect(sql).toContain('create policy "contractors_update_for_active_studio_members"');
    expect(sql).toContain("member.studio_id = category.studio_id");
    expect(sql).toContain("category.id = contractors.category_id");
    expect(sql).toContain("and member.is_active");
    expect(sql).toContain("with check");
  });

  it("does not broaden the admin-only contractor deletion policy", async () => {
    const source = await readFile(migrationPath, "utf8");

    expect(source).not.toContain("contractors_delete_for_active_admins");
  });

  it("rejects category changes that would move a contractor into another studio", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("create function private.prevent_contractor_cross_studio_category_change()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("old_category.studio_id <> new_category.studio_id");
    expect(sql).toContain("before update of category_id on public.contractors");
    expect(sql).toContain("revoke execute on function private.prevent_contractor_cross_studio_category_change() from public, anon, authenticated;");
  });
});
