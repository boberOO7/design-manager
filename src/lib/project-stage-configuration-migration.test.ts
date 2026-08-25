import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260825150000_project_stage_configuration.sql", import.meta.url);

describe("project stage configuration migration contract", () => {
  it("preserves stable stage keys while persisting presentation configuration", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column display_name text null");
    expect(sql).toContain("add column is_enabled boolean not null default true");
    const addColumn = sql.indexOf("add column display_order smallint null");
    const backfill = sql.indexOf("update public.project_task_stage_columns\nset display_order");
    const verify = sql.indexOf("Project stage display order backfill failed");
    const notNull = sql.indexOf("alter column display_order set not null");
    const constraint = sql.indexOf("project_task_stage_columns_display_order_check");
    expect(addColumn).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(addColumn);
    expect(verify).toBeGreaterThan(backfill);
    expect(notNull).toBeGreaterThan(verify);
    expect(constraint).toBeGreaterThan(notNull);
    expect(sql).not.toContain("display_order smallint not null default 0");
    expect(sql).toContain("(new.id, 'stage_1', 1)");
    expect(sql).toContain("(new.id, 'stage_4', 4)");
    expect(sql).toContain("stage not in ('stage_1','stage_2','stage_3','stage_4')");
  });

  it("enforces admin-only, minimum-one-stage, and active-task protection in the database", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("private.is_studio_admin(studio_id)");
    expect(sql).toContain("enabled_count < 1");
    expect(sql).toContain("task.status not in ('completed', 'cancelled')");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("grant update (include_in_productivity) on table public.projects to authenticated;");
    expect(sql).toContain("security invoker");
  });

  it("keeps attribution history immutable and filters leaderboard inclusion at query time", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const leaderboardQuery = await readFile(new URL("../data/queries/index.ts", import.meta.url), "utf8");
    expect(sql).toContain("add column include_in_productivity boolean not null default true");
    expect(sql).not.toContain("delete from public.productivity_attributions");
    expect(leaderboardQuery).toContain("project.include_in_productivity");
  });
});
