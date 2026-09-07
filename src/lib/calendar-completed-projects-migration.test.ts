import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260907150717_allow_completed_projects_for_calendar_events.sql", import.meta.url), "utf8");

describe("completed project calendar events migration", () => {
  it("allows completed projects through calendar event validation and management", () => {
    expect(migration).toContain("project_status not in ('planned', 'active', 'paused', 'completed')");
    expect(migration).toContain("project.status in ('planned', 'active', 'paused', 'completed')");
    expect(migration).toContain("Archived projects cannot receive calendar events");
  });

  it("keeps the insert policy tenant-scoped and project-access guarded", () => {
    expect(migration).toContain("drop policy if exists calendar_events_insert_organizer_or_admin");
    expect(migration).toContain("project.studio_id = calendar_events.studio_id");
    expect(migration).toContain("private.can_access_project(project.id)");
    expect(migration).not.toContain("service_role");
  });
});
