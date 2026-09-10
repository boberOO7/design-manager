import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260910114858_fix_time_off_approval_notification_read_state.sql"), "utf8");

describe("time-off approval notification read-state regression", () => {
  it("only resolves unread submission notifications and preserves one-way read state", () => {
    expect(migration).toContain("and read_at is null;");
    expect(migration).toContain("set read_at = now()");
    expect(migration).not.toContain("set read_at = coalesce(read_at, now())");
    expect(migration).not.toContain("exception when others");
  });
});
