import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260830183617_fix_calendar_event_type_legacy_enum_references.sql", import.meta.url), "utf8");

describe("calendar event canonical enum references", () => {
  it("replaces legacy enum literals in active meeting, invitation, and creation functions", () => {
    expect(migration).toContain("create or replace function private.validate_meeting_presentation_event()");
    expect(migration).toContain("create or replace function private.validate_calendar_event_invite()");
    expect(migration).toContain("create or replace function public.create_calendar_event_with_invites(");
    expect(migration).toContain("('meeting', 'presentation')");
    expect(migration).not.toContain("client_presentation");
  });
});
