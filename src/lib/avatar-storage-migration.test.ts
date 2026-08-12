import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260812185810_profile_avatars.sql", import.meta.url);
const cleanupMigrationPath = new URL("../../supabase/migrations/20260812222709_avatars_select_own_folder.sql", import.meta.url);

describe("profile avatar storage migration", () => {
  it("creates a public, tightly constrained avatar bucket", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("'avatars'");
    expect(sql).toContain("true,");
    expect(sql).toContain("5242880");
    expect(sql).toContain("'image/jpeg', 'image/png', 'image/webp'");
    expect(sql).toContain("avatars_insert_own_folder");
    expect(sql).toContain("avatars_delete_own_folder");
    expect(sql).toContain("array_length(storage.foldername(name), 1) = 1");
    expect(sql).toContain("(select auth.uid()::text)");
  });

  it("allows only an authenticated user to change their own controlled avatar reference", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("function public.update_my_avatar(p_avatar_path text)");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("where id = authenticated_user_id");
    expect(sql).toContain("from storage.objects");
    expect(sql).toContain("bucket_id = 'avatars'");
    expect(sql).toContain("grant execute on function public.update_my_avatar(text) to authenticated");
  });
});

describe("avatar cleanup Storage policy", () => {
  it("allows API cleanup to select only the authenticated user's own folder", async () => {
    const sql = await readFile(cleanupMigrationPath, "utf8");
    expect(sql).toContain("avatars_select_own_folder");
    expect(sql).toContain("for select");
    expect(sql).toContain("bucket_id = 'avatars'");
    expect(sql).toContain("array_length(storage.foldername(name), 1) = 1");
    expect(sql).toContain("(select auth.uid()::text)");
  });
});
