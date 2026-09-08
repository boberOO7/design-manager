import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260908092224_localize_notification_payloads.sql", import.meta.url),
  "utf8",
);

describe("notification localization payload migration", () => {
  it("adds render-time fields for every non-calendar notification producer", () => {
    for (const functionName of [
      "private.notify_time_off_request()",
      "private.notify_task_change()",
      "private.notify_task_collaborator_change()",
      "private.notify_task_collaborators_of_details_change()",
      "private.notify_office_assignment_change()",
      "private.notify_submission_change()",
    ]) {
      expect(migration).toContain(`create or replace function ${functionName}`);
      expect(migration).toContain(`revoke execute on function ${functionName}`);
    }

    for (const field of ["requestType", "startDate", "endDate", "requesterName", "subject", "projectName", "assignmentKind", "change", "dueDate", "authorName", "type", "status"] as const) {
      expect(migration).toContain(`'${field}'`);
    }
  });

  it("preserves private security-definer boundaries and the existing notification helper", () => {
    expect(migration.match(/security definer/g)?.length).toBe(7);
    expect(migration.match(/set search_path = ''/g)?.length).toBe(7);
    expect(migration).not.toContain("grant execute");
    expect(migration).not.toContain("insert into public.notifications");
    expect(migration).not.toContain("update public.notifications");
  });
});
