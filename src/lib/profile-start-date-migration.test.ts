import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260828140000_add_self_service_profile_start_date.sql", import.meta.url);

describe("self-service profile start date migration", () => {
  it("updates the authenticated administrator's membership date without granting employees write access", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("p_joined_at date");
    expect(sql).toContain("where sm.user_id = auth.uid() and sm.is_active");
    expect(sql).toContain("if v_system_role = 'admin' then");
    expect(sql).toContain("set joined_at = p_joined_at");
    expect(sql).toContain("where studio_id = v_studio_id and user_id = auth.uid() and is_active");
    expect(sql).toContain("revoke all on function public.update_my_profile_details(date, text, text, bigint, date) from public, anon");
    expect(sql).toContain("grant execute on function public.update_my_profile_details(date, text, text, bigint, date) to authenticated");
  });
});
