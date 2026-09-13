import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { equipmentCatalogSearchSchema, equipmentManufacturerSuggestions } from "./equipment-reference-catalog";

it("validates bounded provider-neutral catalog queries", () => {
  expect(equipmentCatalogSearchSchema.parse({ type: "cpu", manufacturer: " Intel ", family: "Core i7", query: " 147 " })).toMatchObject({ manufacturer: "Intel", query: "147", field: "model" });
  expect(equipmentCatalogSearchSchema.safeParse({ type: "invalid" }).success).toBe(false);
  expect(equipmentCatalogSearchSchema.safeParse({ type: "monitor", query: "x".repeat(161) }).success).toBe(false);
});

it("supplements catalog manufacturers with creatable common brand references", () => {
  expect(equipmentManufacturerSuggestions("mouse", "Logi", ["LogiLink", "Case Logic"])).toEqual(["Logitech", "LogiLink", "Case Logic"]);
  expect(equipmentManufacturerSuggestions("air_conditioner", "TOS", [])).toEqual(["TOSOT"]);
  expect(equipmentManufacturerSuggestions("motherboard", "AS", [])).toEqual(["ASUS", "ASRock"]);
  expect(equipmentManufacturerSuggestions("power_supply", "Sea", [])).toEqual(["Seasonic"]);
  expect(equipmentManufacturerSuggestions("mouse", "", ["Logitech", "HP", "Trust"])).toEqual([
    "Logitech", "Razer", "Microsoft", "SteelSeries", "Corsair", "HP", "Dell", "Trust",
  ]);
});

describe("catalog migration contract", () => {
  const sql = [
    "supabase/migrations/20260912151329_canonical_equipment_catalog_storage.sql",
    "supabase/migrations/20260912152923_catalog_provider_admin_read.sql",
    "supabase/migrations/20260912153057_catalog_import_typed_affected_ids.sql",
    "supabase/migrations/20260913123049_refine_equipment_component_catalog.sql",
  ].map(path => readFileSync(path, "utf8")).join("\n");
  const completionSql = readFileSync("supabase/migrations/20260912163544_safe_catalog_sync_completion.sql", "utf8");
  it("keeps inventory independent and preserves historical models", () => {
    expect(sql).not.toMatch(/references public\.(equipment|studios)\s*\(|alter table public\.equipment\s/i);
    expect(sql).toContain("canonical_catalog_cutover_requires_empty_product_catalog");
    expect(sql).toContain("unique (catalog_type, search_manufacturer, search_model)");
    expect(sql).toContain("primary key (source, source_product_id)");
    expect(sql).toContain("first_seen_at");
    expect(sql).toContain("existing_provider.source_seen_at > p_generation");
    expect(sql).toContain("existing_provider.source_updated_at > incoming_updated");
    expect(sql).toContain("affected_model_ids bigint[] := array[]::bigint[]");
    expect(sql).not.toMatch(/delete from public\.equipment_catalog_models/i);
  });
  it("uses local indexes, invoker search, RLS and worker-only imports", () => {
    const providerTable = sql.slice(sql.indexOf("create table public.equipment_catalog_provider_products"), sql.indexOf("alter table public.equipment_catalog_models"));
    expect(sql).toContain("gin_trgm_ops");
    expect(sql).toContain("text_pattern_ops");
    expect(providerTable).not.toContain("gin_trgm_ops");
    expect(sql).toContain("from public.equipment_catalog_models m");
    expect(sql).toContain("m.provider_product_count > 0");
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("equipment_catalog_provider_admin_read");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("catalog_sync_lease_lost");
  });
  it("refreshes manufacturer rankings without an unqualified delete", () => {
    expect(completionSql).not.toMatch(/delete\s+from\s+public\.equipment_catalog_manufacturers/i);
    expect(completionSql).toContain("unique (catalog_type, search_name)");
    expect(completionSql).toContain("on conflict (catalog_type, search_name) do update");
  });
});
