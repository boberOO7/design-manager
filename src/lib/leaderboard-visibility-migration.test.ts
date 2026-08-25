import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260826100000_leaderboard_employee_visibility.sql", import.meta.url);

describe("leaderboard employee visibility migration", () => {
  it("defaults studios to employee-hidden without touching productivity data", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("leaderboard_visible_to_employees boolean not null default false");
    expect(sql).toContain("grant select on table public.studios to authenticated;");
    expect(sql).not.toContain("productivity_attributions");
    expect(sql).not.toContain("leaderboard_bonus_rules");
  });

  it("restricts updates to active studio administrators through an authenticated RPC", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("security definer");
    expect(sql).toContain("private.is_studio_admin(p_studio_id)");
    expect(sql).toContain("revoke execute on function public.set_leaderboard_employee_visibility(uuid, boolean) from public, anon;");
    expect(sql).toContain("grant execute on function public.set_leaderboard_employee_visibility(uuid, boolean) to authenticated;");
  });
});
