import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260830170000_calendar_event_semantic_types.sql", import.meta.url), "utf8");

describe("calendar event semantic type migration", () => {
  it("backfills legacy generic and presentation labels without replacing the event column", () => {
    expect(migration).toContain("rename value 'other' to 'general'");
    expect(migration).toContain("rename value 'client_presentation' to 'presentation'");
    expect(migration).not.toContain("add column event_type");
  });
});
