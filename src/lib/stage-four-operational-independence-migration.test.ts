import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260903122126_stage_four_operational_independence.sql", import.meta.url);

describe("Stage 4 operational independence migration contract", () => {
  it("activates planned projects when Stage 1–3 tasks enter an active workflow status", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("private.is_project_progress_stage(new.stage)");
    expect(sql).toContain("new.status in ('in_progress', 'internal_review', 'review', 'completed')");
  });

  it("limits completion validation and completed-project writes by canonical stage identity", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("private.is_project_progress_stage(task.stage)");
    expect(sql).toContain("and (project.status <> 'completed' or not private.is_project_progress_stage(target_stage))");
    expect(sql).toContain("private.can_update_project_task_status(project_id, assignee_id, stage)");
    expect(sql).toContain("private.is_project_progress_stage(old.stage) or private.is_project_progress_stage(new.stage)");
    expect(sql).toContain("project_status = 'completed' and private.is_project_progress_stage(p_stage)");
  });

  it("records Stage 4 task counts with exactly zero area and no task-area snapshot", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add constraint productivity_attributions_credited_area_m2_check check (credited_area_m2 >= 0)");
    expect(sql).toContain("add column task_stage text null check");
    expect(sql).toContain("new.project_id, new.id, new.assignee_id, 'task', new.stage, 0");
    expect(sql).toContain("update public.tasks set productivity_area_m2 = null where stage = 'stage_4'");
    expect(sql).toContain("task.status = 'completed' and task.stage = 'stage_4'");
  });
});
