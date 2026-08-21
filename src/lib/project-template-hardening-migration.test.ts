import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260821150000_harden_project_template_defaults.sql", import.meta.url);

describe("project template hardening migration", () => {
  it("requires default templates to remain active", async () => {
    expect(await readFile(migrationPath, "utf8")).toContain("check (not is_default or is_active)");
  });

  it("rejects duplicate stage assignees before inserting generated tasks", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("count(distinct stage)");
    expect(sql).toContain("Choose only one assignee per stage");
    expect(sql.indexOf("Choose only one assignee per stage")).toBeLessThan(sql.indexOf("insert into public.tasks"));
  });
});
