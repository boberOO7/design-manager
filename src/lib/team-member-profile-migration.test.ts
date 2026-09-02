import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260902170000_add_team_member_profile_location.sql", import.meta.url);

describe("team member profile update RPC", () => {
  it("authorizes only active administrators and keeps profile and membership roles synchronized", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("security definer");
    expect(migration).toContain("sm.user_id = v_actor_id and sm.is_active and sm.system_role = 'admin'");
    expect(migration).toContain("update public.profiles");
    expect(migration).toContain("country_code = normalized_country_code");
    expect(migration).toContain("city = normalized_city");
    expect(migration).toContain("city_geonames_id = p_city_geonames_id");
    expect(migration).toContain("update public.studio_members");
    expect(migration).toContain("set system_role = p_system_role");
  });

  it("permits promotion while preventing self-edits and a last-admin demotion", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("if p_user_id = v_actor_id then");
    expect(migration).toContain("v_target_role = 'admin' and p_system_role = 'employee'");
    expect(migration).toContain("The last active administrator cannot be demoted");
    expect(migration).toContain("A profile city requires a country");
    expect(migration).toContain("grant execute on function public.update_studio_member_profile(uuid, text, text, text, date, date, text, text, bigint) to authenticated");
    expect(migration).toContain("revoke all on function public.update_studio_member_profile(uuid, text, text, text, date, date, text, text, bigint) from public, anon");
  });
});
