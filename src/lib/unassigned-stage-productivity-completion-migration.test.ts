import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260826140000_allow_unassigned_stage_productivity_completion.sql", import.meta.url);

describe("unassigned stage productivity completion migration contract", () => {
  it("allows unassigned tasks to complete before creating productivity snapshots or credit", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const unassignedReturn = sql.indexOf("if new.assignee_id is null then return new; end if;");
    const snapshot = sql.indexOf("snapshot_area := new.productivity_area_m2");

    expect(unassignedReturn).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(unassignedReturn);
    expect(sql).toContain("Attributed task completion requires an active project-member assignee");
  });
});
