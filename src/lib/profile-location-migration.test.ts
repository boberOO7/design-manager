import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260812210630_profile_location.sql", import.meta.url);

describe("profile location migration", () => {
  it("adds nullable structured location fields", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column country_code text");
    expect(sql).toContain("add column city text");
    expect(sql).toContain("add column city_geonames_id bigint");
    expect(sql).toContain("profiles_country_code_iso_alpha_2");
  });

  it("keeps location updates self-scoped and narrowly executable", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("function public.update_my_profile_location");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("where id = auth.uid()");
    expect(sql).toContain("revoke all on function public.update_my_profile_location(text, text, bigint) from public, anon");
    expect(sql).toContain("grant execute on function public.update_my_profile_location(text, text, bigint) to authenticated");
  });
});
