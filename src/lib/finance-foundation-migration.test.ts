import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260916200241_finance_foundation.sql", "utf8");

describe("Finance migration boundary", () => {
  it("protects every new Data API table and grants reads only", () => {
    for (const table of ["finance_settings", "finance_accounts", "finance_currencies"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain("member.system_role = 'admin' and member.is_active and profile.is_active");
    expect(sql).toContain("select count(*) = 1 from public.studio_members");
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all) on table/i);
    expect(sql).toContain("from public, anon, authenticated, service_role");
  });
  it("provides tenant-safe references and serializes finalization with account writes", () => {
    expect(sql).toContain("unique (studio_id, id)");
    expect(sql).toContain("references public.finance_settings(studio_id) on delete restrict");
    expect(sql).toContain("where studio_id = new.studio_id for update");
    expect(sql).toContain("finance_opening_locked");
    expect(sql).toContain("finance_balance_precision");
    expect(sql).not.toMatch(/insert into public\.(?:notifications|project_activity|equipment_service_events)/);
  });
});
