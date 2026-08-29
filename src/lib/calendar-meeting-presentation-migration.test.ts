import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260829180000_add_meeting_presentation_mode.sql"), "utf8");

describe("Meeting/presentation migration contract", () => {
  it("stores an explicit online/offline mode", () => {
    expect(migration).toContain("add column meeting_mode text;");
    expect(migration).toContain("calendar_events_meeting_mode_by_type check");
    expect(migration).toContain("meeting_mode is not null and meeting_mode in ('offline', 'online')");
    expect(migration).toContain("meeting_mode is null");
  });

  it("enforces same-day timed meetings and clears the irrelevant transport field", () => {
    expect(migration).toContain("Meetings and presentations must be timed and non-recurring");
    expect(migration).toContain("Meetings and presentations must start and end on the same Europe/Kyiv calendar day");
    expect(migration).toContain("Offline meetings cannot include a meeting link");
    expect(migration).toContain("Online meetings cannot include a location");
  });

  it("temporarily disables only the organizer authorization trigger for the backfill", () => {
    expect(migration).toContain("disable trigger validate_calendar_event_before_write");
    expect(migration).toContain("enable trigger validate_calendar_event_before_write");
    expect(migration).not.toContain("session_replication_role");
    expect(migration).not.toContain("disable trigger all");
  });
});
