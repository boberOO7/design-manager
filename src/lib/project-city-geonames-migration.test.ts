import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260806175022_add_project_city_geonames_id.sql", import.meta.url);

describe("project city GeoNames migration", () => {
  it("adds a nullable ID without changing project RLS and preserves metadata write protections", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("add column city_geonames_id bigint;");
    expect(source).toContain("grant update (city_geonames_id) on table public.projects to authenticated;");
    expect(source).toContain("before update of project_type, country_code, city, city_geonames_id on public.projects");
    expect(source).toContain("or new.city_geonames_id is distinct from old.city_geonames_id");
    expect(source).not.toMatch(/create policy|alter table public\.projects enable row level security/i);
  });
});
