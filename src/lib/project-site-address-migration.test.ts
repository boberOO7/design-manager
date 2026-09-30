import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260930120000_add_project_site_address.sql", import.meta.url);

describe("project site address migration", () => {
  it("keeps address optional, writable under existing policies, and included in Lead conversion", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("alter table public.crm_leads add column site_address text");
    expect(sql).toContain("alter table public.projects add column site_address text");
    expect(sql).toContain("grant update (site_address) on public.crm_leads to authenticated");
    expect(sql).toContain("grant update (site_address) on public.projects to authenticated");
    expect(sql).toContain("city_geonames_id, site_address on public.projects");
    expect(sql).toContain("new.site_address is distinct from old.site_address");
    expect(sql).toContain("city, city_geonames_id, site_address, client_name, description");
    expect(sql).toContain("nullif(btrim(p_project->>'site_address'), '')");
    expect(sql).not.toMatch(/site_address text not null/i);
  });
});
