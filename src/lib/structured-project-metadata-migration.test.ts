import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260805212420_structured_project_metadata.sql", import.meta.url);

describe("structured project metadata migration", () => {
  it("backfills required country codes without replacing existing project types", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column country_code text");
    expect(sql).toContain("set country_code = 'UA'");
    expect(sql).toContain("alter column country_code set not null");
    expect(sql).not.toContain("set project_type =");
  });

  it("allocates studio/year codes atomically in private PostgreSQL state", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create table private.project_code_counters");
    expect(sql).toContain("primary key (studio_id, calendar_year)");
    expect(sql).toContain("on conflict (studio_id, calendar_year)");
    expect(sql).toContain("do update set last_value = private.project_code_counters.last_value + 1");
    expect(sql).toContain("timezone('Europe/Kyiv', current_timestamp)");
    expect(sql).toContain("candidate := 'SPACE_' || code_year::text || '_' || lpad(next_value::text, 3, '0')");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("revoke all on table private.project_code_counters from public, anon, authenticated");
    expect(sql).toContain("projects_studio_project_code_unique");
  });

  it("preserves legacy types until explicitly changed and does not replace project RLS policies", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("new.project_type is distinct from old.project_type");
    expect(sql).toContain("Project type must be a canonical key or null");
    expect(sql).not.toContain("drop policy");
    expect(sql).not.toContain("create policy");
  });
});
