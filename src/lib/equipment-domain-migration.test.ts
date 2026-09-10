import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260910193120_equipment_domain_foundation.sql",
  "utf8",
);

describe("equipment domain migration", () => {
  it("models workstations and independent equipment with studio-safe relationships", () => {
    expect(migration).toContain("create table public.workstations");
    expect(migration).toContain("assigned_employee_id uuid");
    expect(migration).toContain("create table public.equipment");
    expect(migration).toContain("workstation_id uuid");
    expect(migration).toMatch(
      /foreign key \(studio_id, workstation_id\)[\s\S]*references public\.workstations\(studio_id, id\)[\s\S]*on delete set null/,
    );
  });

  it("contains every required equipment type, lifecycle state, and optional computer specification", () => {
    for (const type of [
      "pc",
      "laptop",
      "monitor",
      "mouse",
      "keyboard",
      "headphones",
      "webcam",
      "air_conditioner",
      "printer",
      "coffee_machine",
      "other",
    ]) {
      expect(migration).toContain(`'${type}'`);
    }

    for (const state of ["active", "spare", "in_service", "retired"]) {
      expect(migration).toContain(`'${state}'`);
    }

    expect(migration).toMatch(/cpu text[\s\S]*gpu text[\s\S]*ram text[\s\S]*storage text/);
    expect(migration).toContain("equipment_computer_specs_match_type");
  });

  it("uses explicit Data API grants and operation-specific admin-only RLS", () => {
    expect(migration).toContain("alter table public.workstations enable row level security");
    expect(migration).toContain("alter table public.equipment enable row level security");
    expect(migration).toContain(
      "revoke all on table public.workstations, public.equipment from anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.workstations, public.equipment to authenticated",
    );
    expect(migration.match(/private\.is_studio_admin\(studio_id\)/g)).toHaveLength(10);
    expect(migration).not.toMatch(/for all/i);
  });

  it("does not introduce maintenance, history, notification, or cost fields", () => {
    const tableDefinitions = migration.slice(
      migration.indexOf("create table public.workstations"),
      migration.indexOf("create index workstations_studio_name_unique_idx"),
    ) + migration.slice(
      migration.indexOf("create table public.equipment"),
      migration.indexOf("create index equipment_studio_state_type_idx"),
    );

    expect(tableDefinitions).not.toMatch(
      /maintenance|service_history|repair_history|upgrade_history|notification|warranty|qr_code|cost/,
    );
  });
});
