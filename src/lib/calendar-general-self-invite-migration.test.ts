import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260907153151_allow_general_event_organizer_invitation.sql"), "utf8");

describe("Generic calendar event organizer invitation migration", () => {
  it("allows self-invitation only for generic events at both persistence gates", () => {
    expect(migration).toContain("new.user_id = event_row.organizer_id and event_row.event_type <> 'general'");
    expect(migration).toContain("where p_event_type = 'general' or attendee_id <> (select auth.uid())");
  });

  it("preserves active membership and project membership validation", () => {
    expect(migration).toContain("Invitee must be an active studio member");
    expect(migration).toContain("Project event invitees must be active project members");
  });
});
