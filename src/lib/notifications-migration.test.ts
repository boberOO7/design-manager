import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728214907_in_app_notifications.sql"), "utf8");

describe("notifications migration security contract", () => {
  it("keeps notification rows recipient-private and read-only", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.notifications from anon, authenticated");
    expect(migration).toContain("grant update (read_at)");
    expect(migration).toContain("recipient_id = (select auth.uid())");
    expect(migration).toContain("Notifications cannot be marked unread");
  });
  it("uses private trusted notification creation and all MVP event sources", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke execute on function private.create_notification");
    expect(migration).toContain("notify_time_off_request_after_write");
    expect(migration).toContain("notify_task_change_after_write");
    expect(migration).toContain("notify_calendar_attendee_after_insert");
    expect(migration).toContain("notify_calendar_event_change_after_update");
  });
  it("skips invalid recipients without aborting their source transaction", () => {
    expect(migration).toContain("inner join public.profiles as profile on profile.id = member.user_id");
    expect(migration).toContain("and member.is_active");
    expect(migration).toContain("and profile.is_active");
    expect(migration).not.toContain("Notification recipient must be an active studio member");
    expect(migration).toContain("if p_recipient_id is null or p_recipient_id = p_actor_id then return; end if;");
  });
  it("bounds trusted generated text while preserving non-empty validation", () => {
    expect(migration).toContain("length(btrim(p_title)) = 0");
    expect(migration).toContain("length(btrim(p_body)) = 0");
    expect(migration).toContain("left(p_title, 160), left(p_body, 500)");
  });
  it("uses only a real authenticated actor or the decision reviewer", () => {
    expect(migration).toContain("actor := new.reviewed_by;");
    expect(migration).toContain("actor := (select auth.uid());");
    expect(migration).not.toContain("coalesce((select auth.uid()), new.created_by)");
    expect(migration).not.toContain("coalesce(actor, event_row.created_by)");
  });
  it("keeps task branches OLD-safe and Calendar recipients distinct and active", () => {
    expect(migration).toContain("if tg_op = 'INSERT' then");
    expect(migration).toContain("elsif tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then");
    expect(migration).toContain("elsif tg_op = 'UPDATE' and new.assignee_id is distinct from actor");
    expect(migration).toContain("select distinct attendee.user_id");
    expect(migration).toContain("and member.user_id = attendee.user_id and member.is_active");
    expect(migration).toContain("profile.id = attendee.user_id and profile.is_active");
  });
});
