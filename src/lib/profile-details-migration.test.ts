import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260828100000_consolidate_self_service_profile_updates.sql", import.meta.url);

describe("self-service profile details migration", () => {
  it("atomically updates only the authenticated profile", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("function public.update_my_profile_details(");
    expect(sql).toContain("birth_date = p_birth_date");
    expect(sql).toContain("country_code = normalized_country_code");
    expect(sql).toContain("city = normalized_city");
    expect(sql).toContain("where id = auth.uid()");
    expect(sql).toContain("revoke all on function public.update_my_profile_details(date, text, text, bigint) from public, anon");
    expect(sql).toContain("grant execute on function public.update_my_profile_details(date, text, text, bigint) to authenticated");
  });
});
