import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260818180000_canonical_project_types.sql", import.meta.url);
const structuredMetadataMigrationPath = new URL("../../supabase/migrations/20260805212420_structured_project_metadata.sql", import.meta.url);

describe("canonical project types migration", () => {
  it("maps known legacy values, preserves NULLs, and retains unknown values as Other custom names", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column project_type_custom text");
    expect(sql).toContain("in ('private', 'residential') then 'private'");
    expect(sql).toContain("in ('horeca', 'hospitality') then 'horeca'");
    expect(sql).toContain("else 'other'");
    expect(sql).toContain("when project_type is null then null");
    expect(sql).not.toContain("when null then null");
    expect(sql).toContain("coalesce(nullif(btrim(project_type_custom), ''), nullif(btrim(project_type), ''))");
  });

  it("enforces the five canonical keys and clears custom names outside Other", async () => {
    const [sql, structuredMetadataSql] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(structuredMetadataMigrationPath, "utf8"),
    ]);
    expect(sql).toContain("'private', 'commercial', 'horeca', 'medical', 'other'");
    expect(sql).toContain("if new.project_type is distinct from 'other' then");
    expect(sql).toContain("new.project_type_custom := null;");
    expect(sql).toContain("before update of project_type, project_type_custom, country_code, city, city_geonames_id");
    expect(sql).toContain("grant update (project_type_custom) on table public.projects to authenticated;");
    expect(structuredMetadataSql).toContain("create trigger enforce_structured_project_metadata_before_insert");
    expect(structuredMetadataSql).toContain("before insert on public.projects");
    expect(structuredMetadataSql).toContain("execute function private.enforce_structured_project_metadata();");
  });

  it("disables only the old UPDATE trigger while legacy rows are normalized", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const addCustomColumn = sql.indexOf("add column project_type_custom");
    const dropUpdateTrigger = sql.indexOf("drop trigger enforce_structured_project_metadata_before_update");
    const backfill = sql.indexOf("update public.projects");
    const replaceFunction = sql.indexOf("create or replace function private.enforce_structured_project_metadata()");
    const recreateUpdateTrigger = sql.indexOf("create trigger enforce_structured_project_metadata_before_update");

    expect(addCustomColumn).toBeGreaterThanOrEqual(0);
    expect(dropUpdateTrigger).toBeGreaterThan(addCustomColumn);
    expect(backfill).toBeGreaterThan(dropUpdateTrigger);
    expect(replaceFunction).toBeGreaterThan(backfill);
    expect(recreateUpdateTrigger).toBeGreaterThan(replaceFunction);
    expect(sql).not.toContain("drop trigger enforce_structured_project_metadata_before_insert");
    expect(sql).not.toContain("create trigger enforce_structured_project_metadata_before_insert");
  });
});
