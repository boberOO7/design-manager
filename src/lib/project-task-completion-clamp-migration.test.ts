import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20260915154619_clamp_project_task_completion_dates.sql", import.meta.url);

describe("project task completion-date clamp migration", () => {
  it("clamps only later completed production-task dates when a project is backdated", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("new.completed_at < old.completed_at");
    expect(sql).toContain("private.is_project_progress_stage(task.stage)");
    expect(sql).toContain("task.status = 'completed'");
    expect(sql).toContain("task.completed_at > new.completed_at");
    expect(sql).toContain("set completed_at = new.completed_at");
  });

  it("keeps the correction privileged and atomic with task attribution updates", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("private.is_studio_admin(new.studio_id)");
    expect(sql).toContain("after update of completed_at on public.projects");
    expect(sql).toContain("revoke execute on function private.clamp_project_task_completion_dates()");
  });
});
