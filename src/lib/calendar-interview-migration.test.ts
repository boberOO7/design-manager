import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260829220311_specialize_interview_calendar_events.sql", import.meta.url);

describe("Interview calendar specialization migration", () => {
  it("uses the existing event assignee as one active studio-admin interviewer", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("new.event_type = 'interview'");
    expect(sql).toContain("Only active studio administrators may create or manage interviews");
    expect(sql).toContain("membership.system_role = 'admin'");
    expect(sql).toContain("Interview interviewer must be an active studio administrator");
  });

  it("requires a timed same-day interview without a project, recurrence, location, or invitations", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("Interviews require one interviewer and must be timed, non-recurring, project-free, and without a location");
    expect(sql).toContain("Interviews must start and end on the same Europe/Kyiv calendar day");
    expect(sql).toContain("elsif p_event_type not in ('site_visit', 'interview') then");
    expect(sql).toContain("Interviews do not use invitations");
  });
});
