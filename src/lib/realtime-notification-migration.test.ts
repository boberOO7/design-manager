import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260914002804_realtime_notification_presentation.sql", import.meta.url);

describe("realtime notification presentation migration", () => {
  it("adds default-on preferences and preserves them when older clients omit the arguments", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("notification_popups_enabled boolean not null default true");
    expect(sql).toContain("notification_sound_enabled boolean not null default true");
    expect(sql).toContain("coalesce(p_notification_popups_enabled, notification_popups_enabled)");
    expect(sql).toContain("coalesce(p_notification_sound_enabled, notification_sound_enabled)");
    expect(sql).toContain("where id = auth.uid()");
  });

  it("keeps the profile RPC least-privileged and enables notification Postgres Changes", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function public.update_my_profile_details(date, text, text, bigint, date, boolean, boolean) from public, anon");
    expect(sql).toContain("grant execute on function public.update_my_profile_details(date, text, text, bigint, date, boolean, boolean) to authenticated");
    expect(sql).toContain("alter publication supabase_realtime add table public.notifications");
  });
});
