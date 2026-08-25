import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260825103801_stage_productivity_accounting.sql", import.meta.url);

describe("stage productivity accounting migration contract", () => {
  it("persists task snapshots and the frozen per-project-stage budget state", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column productivity_area_m2 numeric null check (productivity_area_m2 >= 0)");
    expect(sql).toContain("create table public.project_stage_productivity_budgets");
    expect(sql).toContain("project_area_m2 numeric not null");
    expect(sql).toContain("allocated_productivity_m2 numeric not null default 0");
    expect(sql).toContain("when 'stage_1' then 0.20::numeric");
    expect(sql).toContain("when 'stage_3' then 0.80::numeric");
  });

  it("allocates only unallocated budget among non-cancelled, unsnapshotted tasks", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("task.status <> 'cancelled'");
    expect(sql).toContain("task.productivity_area_m2 is null");
    expect(sql).toContain("stage_budget.productivity_budget_m2 - stage_budget.allocated_productivity_m2");
    expect(sql).toContain("for update");
  });

  it("reuses a task snapshot after reopen while voiding only its active contribution", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("snapshot_area := new.productivity_area_m2");
    expect(sql).toContain("set voided_at = now()");
    expect(sql).toContain("where task_id = old.id and source_type = 'task' and voided_at is null");
  });

  it("uses the task completion date as the attribution timestamp and closes the backfill block", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv', now())");
    expect(sql.trimEnd()).toMatch(/end;\n\$\$;$/);
  });

  it("rejects unassigned productive work before it can materialize a task snapshot or reserve stage budget", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const assigneeCheck = sql.indexOf("Productivity-bearing task completion requires an active project-member assignee");
    const allocation = sql.indexOf("snapshot_area := new.productivity_area_m2");
    expect(assigneeCheck).toBeGreaterThan(-1);
    expect(allocation).toBeGreaterThan(assigneeCheck);
    expect(sql).toContain("new.stage in ('stage_1', 'stage_3') and coalesce(task_project.total_area_m2, 0) > 0");
  });

  it("backfills Stage 2 and historical Stage 1/3 tasks without mutable-area reads in rating queries", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("set productivity_area_m2 = coalesce(completed_area_m2, 0)");
    expect(sql).toContain("order by task.completed_at nulls last, task.created_at, task.id");
    expect(sql).toContain("set credited_area_m2 = task.productivity_area_m2");
    expect(sql).toContain("coalesce(task.completed_at::timestamp at time zone 'Europe/Kyiv', task.created_at)");
  });

  it("keeps the new stage-budget table available through authenticated, RLS-scoped reads", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("grant select on table public.project_stage_productivity_budgets to authenticated");
    expect(sql).toContain("private.can_access_project(project_id)");
  });
});
