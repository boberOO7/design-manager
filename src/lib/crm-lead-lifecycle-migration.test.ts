import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  new URL("../../supabase/migrations/20260909103844_add_crm_lead_history_and_follow_up_notifications.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../supabase/migrations/20260909104850_add_crm_lead_lifecycle_behavior.sql", import.meta.url),
  "utf8",
);
const backfillMigration = readFileSync(
  new URL("../../supabase/migrations/20260909110030_backfill_crm_lead_follow_up_notifications.sql", import.meta.url),
  "utf8",
);
const notificationsQuery = readFileSync(new URL("../data/queries/notifications.ts", import.meta.url), "utf8");
const markAllRoute = readFileSync(new URL("../app/api/notifications/read-all/route.ts", import.meta.url), "utf8");

describe("CRM lead lifecycle migration contract", () => {
  it("commits the notification enum value before using it", () => {
    expect(enumMigration).toContain("alter type public.notification_type add value if not exists 'crm_lead_follow_up'");
    expect(migration).not.toContain("alter type public.notification_type");
  });
  it("persists small, admin-scoped lead lifecycle history", () => {
    expect(migration).toContain("create table public.crm_lead_history");
    expect(migration).toContain("event_type in ('created', 'status_changed')");
    expect(migration).toContain("previous_status public.crm_lead_status");
    expect(migration).toContain("new_status public.crm_lead_status");
    expect(migration).toContain("actor_id uuid references public.profiles(id) on delete set null");
    expect(migration).toContain("using ((select private.is_active_crm_admin(studio_id)))");
    expect(migration).toContain("revoke all on table public.crm_lead_history from anon, authenticated");
    expect(migration).toContain("grant select on table public.crm_lead_history to authenticated");
  });

  it("records creation and real status changes without logging every edit", () => {
    expect(migration).toContain("after insert or update of status on public.crm_leads");
    expect(migration).toContain("elsif new.status is distinct from old.status then");
    expect(migration).not.toContain("new.company is distinct from old.company");
  });

  it("keeps exactly one unread follow-up reminder and removes it on clear or delete", () => {
    expect(migration).toContain("notifications_unread_crm_lead_follow_up_idx");
    expect(migration).toContain("and read_at is null");
    expect(migration).toContain("if new.next_contact_date is null or new.responsible_admin_id is null then");
    expect(migration).toContain("if tg_op = 'DELETE' then");
    expect(migration).toContain("new.responsible_admin_id is not distinct from old.responsible_admin_id");
    expect(backfillMigration).toContain("from public.crm_leads as lead\nwhere lead.next_contact_date is not null");
  });

  it("uses the existing notification table and hides future reminders until due", () => {
    expect(migration).toContain("insert into public.notifications");
    expect(migration).not.toContain("create table public.crm_lead_reminders");
    expect(notificationsQuery).toContain('.lte("created_at", now)');
    expect(markAllRoute).toContain('.lte("created_at", now)');
  });
});
