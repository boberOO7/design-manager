import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260827124000_add_self_service_profile_birthday.sql", import.meta.url);

describe("self-service profile birthday migration", () => {
  it("keeps birthday updates self-scoped and narrowly executable", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("function public.update_my_profile_birthday(p_birth_date date)");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("where id = auth.uid()");
    expect(sql).toContain("revoke all on function public.update_my_profile_birthday(date) from public, anon");
    expect(sql).toContain("grant execute on function public.update_my_profile_birthday(date) to authenticated");
  });
});
