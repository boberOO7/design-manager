import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(new URL("../../supabase/migrations/20260913214457_reliable_crm_lead_follow_ups.sql", import.meta.url), "utf8");
const stateMigration = readFileSync(new URL("../../supabase/migrations/20260913214647_add_crm_follow_up_state.sql", import.meta.url), "utf8");
const statusSyncMigration = readFileSync(new URL("../../supabase/migrations/20260913220044_sync_crm_follow_up_on_status_change.sql", import.meta.url), "utf8");

describe("CRM lead follow-up migration", () => {
  it("adds structured invalid leads and clears their active follow-up", () => {
    expect(enumMigration).toContain("add value if not exists 'invalid'");
    expect(stateMigration).toContain("create type public.crm_invalid_reason");
    expect(stateMigration).toContain("new.next_contact_at := null");
    expect(stateMigration).toContain("crm_leads_invalid_reason_status");
    expect(stateMigration).toContain("An invalid lead cannot be converted to a project");
  });

  it("migrates follow-ups to concrete timestamps and schedules one current signal", () => {
    expect(stateMigration).toContain("rename column next_contact_date to next_contact_at");
    expect(stateMigration).toContain("alter column next_contact_at type timestamptz");
    expect(stateMigration).toContain("new.next_contact_at\n  );");
    expect(stateMigration).toContain("and read_at is null");
    expect(stateMigration).toContain("'/crm/leads?lead=' || new.id");
    expect(statusSyncMigration).toContain("update of status, next_contact_at");
  });
});
