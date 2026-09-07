import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20260907195437_allow_admin_task_completion_date_edit.sql", import.meta.url);

describe("admin task completion date migration", () => {
  it("keeps completion dates authoritative and database-authorized", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).not.toContain("grant update (completed_at) on table public.tasks to authenticated");
    expect(sql).toContain("Only administrators may edit task completion dates");
    expect(sql).toContain("Only completed tasks may have a completion date");
    expect(sql).toContain("Task completion date cannot be in the future");
    expect(sql).toContain("private.is_studio_admin(task_studio_id)");
    expect(sql).toContain("is_completion_date_only_edit");
    expect(sql).toContain("create or replace function public.update_task_details_with_collaborators");
    expect(sql).toContain("security definer");
    expect(sql).toContain("(select auth.uid()) is null");
    expect(sql).toContain("(select count(*) from jsonb_object_keys(p_task)) = 1");
  });

  it("moves the active immutable attribution into the corrected Kyiv period", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("create trigger sync_task_productivity_completion_date_after_update");
    expect(sql).toContain("after update of completed_at on public.tasks");
    expect(sql).toContain("set completed_at = new.completed_at::timestamp at time zone 'Europe/Kyiv'");
    expect(sql).toContain("and source_type = 'task'");
    expect(sql).toContain("and voided_at is null");
  });

  it("keeps the existing atomic task-details RPC and records an activity change", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("create or replace function public.update_task_details_with_collaborators");
    expect(sql).toContain("security definer");
    expect(sql).toContain("when p_task ? 'completed_at'");
    expect(sql).toContain("jsonb_build_object('completed_at'");
  });
});
