import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260908165338_normalize_crm_lead_project_metadata.sql", import.meta.url);
const constraintMigrationPath = new URL("../../supabase/migrations/20260908171623_tighten_crm_lead_project_type_constraint.sql", import.meta.url);
const currencyMigrationPath = new URL("../../supabase/migrations/20260909204000_extend_crm_lead_budget_currencies.sql", import.meta.url);

describe("CRM lead metadata migration", () => {
  it("adds structured project metadata and currency semantics without replacing legacy fields", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const column of ["country_code", "city_geonames_id", "expected_project_type_custom", "budget_amount", "budget_currency"]) {
      expect(sql).toContain(`add column ${column}`);
    }
    expect(sql).toContain("crm_leads_budget_semantics");
    expect(sql).toContain("budget_currency in ('UAH', 'USD')");
    expect(sql).not.toContain("drop column");
    expect(sql).not.toContain("drop policy");
  });

  it("preserves CRM grants and does not weaken the admin-only RLS boundary", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toContain("to anon");
    expect(sql).not.toContain("disable row level security");
  });

  it("allows a custom type only when Other is selected", async () => {
    const sql = await readFile(constraintMigrationPath, "utf8");
    expect(sql).toContain("expected_project_type_custom is null");
    expect(sql).toContain("coalesce(expected_project_type = 'other', false)");
  });

  it("extends explicit Lead budget currencies without changing storage or RLS", async () => {
    const sql = await readFile(currencyMigrationPath, "utf8");
    expect(sql).toContain("budget_currency in ('UAH', 'USD', 'EUR', 'PLN')");
    expect(sql).toContain("budget_amount > 0");
    expect(sql).not.toContain("disable row level security");
    expect(sql).not.toContain("drop column");
  });
});
