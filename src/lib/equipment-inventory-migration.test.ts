import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260911221152_equipment_inventory_identity.sql", "utf8");
it("reserves all legacy asset tags before backfilling only missing codes", () => {
  const reservation = migration.indexOf("select studio_id, lower(asset_tag) from public.equipment where asset_tag is not null");
  const backfill = migration.indexOf("select id from public.equipment where asset_tag is null order by created_at, id");
  expect(reservation).toBeGreaterThan(0);
  expect(backfill).toBeGreaterThan(reservation);
  expect(migration).toContain("set search_path = ''");
  expect(migration).toContain("on conflict (studio_id, prefix) do update set last_number = counter.last_number + 1");
  expect(migration).not.toMatch(/delete from private\.equipment_inventory/);
  expect(migration).toContain("alter column asset_tag set not null");
  expect(migration).toContain("private.is_studio_admin(p_studio_id)");
});
