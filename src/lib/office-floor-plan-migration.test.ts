import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260913164707_add_office_floor_plan_layout.sql", "utf8");

describe("office floor-plan migration", () => {
  it("stores one tenant-safe entity per normalized placement", () => {
    expect(migration).toContain("create table public.office_floor_plan_placements");
    expect(migration).toContain("num_nonnulls(workstation_id, equipment_id) = 1");
    expect(migration).toContain("x between 0 and 1");
    expect(migration).toContain("y between 0 and 1");
    expect(migration).toMatch(/foreign key \(studio_id, workstation_id\)[\s\S]*references public\.workstations\(studio_id, id\)/);
    expect(migration).toMatch(/foreign key \(studio_id, equipment_id\)[\s\S]*references public\.equipment\(studio_id, id\)/);
  });

  it("uses admin-only RLS and one guarded atomic save RPC", () => {
    expect(migration).toContain("alter table public.office_floor_plan_placements enable row level security");
    expect(migration.match(/private\.is_studio_admin/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("create function public.save_office_floor_plan_layout");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("delete from public.office_floor_plan_placements where studio_id = p_studio_id");
    expect(migration).toContain("grant execute on function public.save_office_floor_plan_layout(uuid, jsonb)");
  });

  it("limits placement to office workstations and useful standalone equipment", () => {
    expect(migration).toContain("workstation.workstation_type = 'office'");
    expect(migration).toContain("item.equipment_type in ('air_conditioner', 'printer', 'coffee_machine', 'other')");
  });
});
