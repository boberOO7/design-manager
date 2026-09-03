import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20260902180000_add_task_milestone_deadlines.sql", import.meta.url);

describe("task milestone deadlines migration", () => {
  it("preserves legacy due dates, protects authenticated writes, and distinguishes omitted deadline input", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("create table public.task_deadlines");
    expect(sql).toContain("target_status in ('internal_review', 'review', 'completed')");
    expect(sql).not.toContain("target_status in ('in_progress', 'internal_review', 'review', 'completed')");
    expect(sql).toContain("unique (task_id, target_status)");
    expect(sql).toContain("select id, 'completed', due_date");
    expect(sql).toContain("alter table public.task_deadlines enable row level security");
    expect(sql).toContain("grant select, insert, delete on table public.task_deadlines to authenticated");
    expect(sql).toContain('create policy "task_deadlines_write_for_studio_admins"');
    expect(sql).toContain("p_deadlines jsonb default null");
    expect(sql).toContain("if p_deadlines is not null then");
    expect(sql).toContain("delete from public.task_deadlines where task_id = p_task_id;");
    expect(sql).toContain("insert into public.task_deadlines (task_id, target_status, due_date)");
    expect(sql).toContain("'todo') returning id into new_task_id");
    expect(sql).toContain("p_task ? 'deadlines'");
    expect(sql).toContain("p_task -> 'collaborator_ids'");
    expect(sql).toContain("completed_area_m2, progress_weight, stage, status");
    expect(sql).toContain("coalesce(nullif(p_task ->> 'progress_weight', '')::numeric, 1)");
    expect(sql).toContain("grant insert (\n  project_id,");
    expect(sql).toContain("progress_weight,\n  stage,\n  status\n) on table public.tasks to authenticated;");
    expect(sql).not.toContain("grant insert on table public.tasks to authenticated;");
  });
});
