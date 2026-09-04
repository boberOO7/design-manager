import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260904135441_office_assignments.sql", "utf8");

describe("office assignments migration", () => {
  it("uses a dedicated table and canonical workflow", () => {
    expect(migration).toContain("create table public.office_assignments");
    expect(migration).toContain("('assigned', 'in_progress')");
    expect(migration).toContain("('in_progress', 'done')");
  });

  it("enforces RLS, explicit grants, admin creation, and assignee visibility", () => {
    expect(migration).toContain("alter table public.office_assignments enable row level security");
    expect(migration).toContain("grant select on table public.office_assignments to authenticated");
    expect(migration).toContain("member.system_role = 'admin'");
    expect(migration).toContain("responsible_id = (select auth.uid())");
  });

  it("does not reference production work or metrics", () => {
    const table = migration.slice(migration.indexOf("create table public.office_assignments"), migration.indexOf("create index office_assignments"));
    expect(table).not.toMatch(/project_id|task_id|productivity|area_m2|rating|progress/i);
  });
});
