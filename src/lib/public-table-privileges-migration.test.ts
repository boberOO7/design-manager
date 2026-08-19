import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260815130000_audit_public_table_privileges.sql", import.meta.url);
const taskStatusInsertMigrationPath = new URL("../../supabase/migrations/20260818190000_grant_task_status_insert_privilege.sql", import.meta.url);
const taskDeleteMigrationPath = new URL("../../supabase/migrations/20260818193000_add_admin_task_deletion.sql", import.meta.url);

describe("public table privilege audit migration", () => {
  it("grants authenticated reads for every public application table while keeping anon revoked", async () => {
    const source = await readFile(migrationPath, "utf8");

    for (const table of [
      "studios", "profiles", "studio_members", "projects", "project_members",
      "project_area_progress", "tasks", "task_checklist_items", "project_activity",
      "productivity_attributions", "calendar_events", "calendar_event_attendees",
      "time_off_requests", "notifications", "checklist_templates",
      "checklist_template_items", "contractors",
    ]) {
      expect(source).toContain(`public.${table}`);
    }
    expect(source).toContain("from anon;");
    expect(source).toContain("from authenticated;");
    expect(source).toContain("to authenticated;");
    expect(source).not.toContain("grant all on all tables");
  });

  it("keeps direct writes column-scoped and retains the service-role bootstrap access", async () => {
    const source = await readFile(migrationPath, "utf8");

    expect(source).toContain("city_geonames_id");
    expect(source).toContain("grant update (read_at) on table public.notifications to authenticated;");
    expect(source).toContain("grant select, insert, update on table public.studio_members to service_role;");
  });

  it("restores the workflow status insert privilege without broadening task writes", async () => {
    const source = await readFile(taskStatusInsertMigrationPath, "utf8");

    expect(source).toContain("grant insert (status) on table public.tasks to authenticated;");
    expect(source).not.toMatch(/grant\s+(?:update|delete)\b/i);
    expect(source).not.toContain("to anon");
  });

  it("allows task deletion only through the authenticated, RLS-scoped admin path", async () => {
    const source = await readFile(taskDeleteMigrationPath, "utf8");

    expect(source).toContain("grant delete on table public.tasks to authenticated;");
    expect(source).toContain('create policy "tasks_delete_for_studio_admins"');
    expect(source).toContain("for delete");
    expect(source).toContain("private.is_studio_admin(project.studio_id)");
    expect(source).not.toContain("to anon");
    expect(source).not.toMatch(/grant\s+delete\s+on\s+table\s+public\.tasks\s+to\s+anon/i);
  });

  it("removes inherited service-role capabilities and future Data API defaults", async () => {
    const source = await readFile(migrationPath, "utf8");

    expect(source).toContain("from service_role;");
    expect(source).toContain("revoke all on tables from anon, authenticated, service_role;");
    expect(source).toContain("revoke all on sequences from anon, authenticated, service_role;");
  });
});
