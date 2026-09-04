import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260904173557_submission_operational_inbox.sql", "utf8");

describe("submission operational inbox migration", () => {
  it("backfills and canonically defaults priority to normal", () => {
    expect(migration).toContain("set priority = 'normal'");
    expect(migration).toContain("alter column priority set default 'normal'");
    expect(migration).toContain("alter column priority set not null");
  });

  it("supports the direct suggestion acceptance action", () => {
    expect(migration).toContain("('new','accepted')");
    expect(migration).toContain("when 'suggestion'");
  });

  it("requires an assignee when request work starts without weakening complaint privacy", () => {
    expect(migration).toContain("responsible_required_for_work");
    expect(migration).toContain("complaints_do_not_expose_responsible_participants");
  });
});
