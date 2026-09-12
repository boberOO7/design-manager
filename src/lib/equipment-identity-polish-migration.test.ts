import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260912000918_polish_equipment_identity.sql", "utf8");

describe("equipment identity polish migration", () => {
  it("makes names optional and only clears exact generated fallbacks", () => {
    expect(migration).toContain("alter column display_name drop not null");
    expect(migration).toContain("lower(display_name) = lower(asset_tag)");
    expect(migration).toContain("lower(display_name) = equipment_type::text");
    expect(migration).not.toMatch(/display_name\s*=\s*null\s*where\s+display_name\s+is\s+not\s+null/i);
  });

  it("keeps type and inventory prefixes immutable without releasing reservations", () => {
    expect(migration).toContain("equipment_type_is_immutable");
    expect(migration).toContain("inventory_code_format");
    expect(migration).toContain("insert into private.equipment_inventory_codes");
    expect(migration).not.toContain("delete from private.equipment_inventory_codes");
  });

  it("uses inventory identity for maintenance notifications without a custom name", () => {
    expect(migration).toContain("equipment_label := coalesce(target.display_name, target.asset_tag)");
    expect(migration).toContain("'equipmentName', equipment_label");
  });
});
