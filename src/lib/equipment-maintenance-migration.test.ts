import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260910221602_equipment_maintenance.sql", "utf8");

describe("equipment maintenance migration", () => {
  it("adds constrained recurring scheduling and append-only service history", () => {
    expect(migration).toContain("equipment_maintenance_schedule_check");
    expect(migration).toContain("maintenance_interval_months between 1 and 120");
    expect(migration).toContain("create table public.equipment_service_events");
    expect(migration).toContain("on delete restrict");
    for (const event of ["regular_maintenance", "repair", "upgrade"]) expect(migration).toContain(`'${event}'`);
  });

  it("keeps service transitions atomic and bases the next cycle on completion", () => {
    expect(migration).toContain("create or replace function public.start_equipment_service");
    expect(migration).toContain("create or replace function public.complete_equipment_service");
    expect(migration).toMatch(/then \(p_completed_on \+ make_interval\(months => maintenance_interval_months\)\)::date/);
    expect(migration).toContain("equipment_service_events_one_open_idx");
    expect(migration).toContain("equipment_service_event_required");
  });

  it("notifies active admins once per threshold and resets markers for a new cycle", () => {
    expect(migration).toContain("member.system_role = 'admin'");
    expect(migration).toContain("and member.is_active");
    expect(migration).toContain("and profile.is_active");
    expect(migration).toContain("maintenance_upcoming_notified_for is distinct from equipment.next_maintenance_due_date");
    expect(migration).toContain("maintenance_overdue_notified_for is distinct from equipment.next_maintenance_due_date");
    expect(migration).toContain("reset_equipment_maintenance_notification_cycle_before_update");
    expect(migration).toContain("for update skip locked");
  });

  it("keeps history admin-readable and mutations behind guarded RPCs", () => {
    expect(migration).toContain("equipment_service_events_select_admin");
    expect(migration).toContain("grant select on table public.equipment_service_events to authenticated");
    expect(migration).not.toContain("grant insert, update, delete on table public.equipment_service_events");
    expect(migration.match(/private\.is_studio_admin/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("grant execute on function public.generate_equipment_maintenance_notifications(date)\nto service_role");
  });
});
