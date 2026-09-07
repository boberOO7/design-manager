import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrations = [
  new URL("../../supabase/migrations/20260907203953_add_selected_task_bulk_actions.sql", import.meta.url),
  new URL("../../supabase/migrations/20260907205903_fix_selected_task_bulk_lifecycle_guard.sql", import.meta.url),
  new URL("../../supabase/migrations/20260907210049_fix_selected_task_bulk_assignee_guard.sql", import.meta.url),
];

describe("selected task bulk actions migration", () => {
  it("keeps exact-id assignment and milestone deadlines atomic and admin guarded", async () => {
    const sql = (await Promise.all(migrations.map((migration) => readFile(migration, "utf8")))).join("\n");

    expect(sql).toContain("create or replace function public.bulk_assign_selected_project_tasks");
    expect(sql).toContain("create or replace function public.bulk_set_project_task_deadline");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("private.is_studio_admin(project_studio_id)");
    expect(sql).toContain("project_status = 'completed' and p_stage in ('stage_1', 'stage_2', 'stage_3')");
    expect(sql).toContain("from public.project_members as assignment");
    expect(sql).toContain("perform 1 from public.tasks as task where task.id = any(p_task_ids) order by task.id for update");
    expect(sql).toContain("selected_count <> cardinality(p_task_ids)");
    expect(sql).toContain("deadline.target_status = p_target_status");
    expect(sql).toContain("from unnest(p_task_ids) as task_id");
    expect(sql).toContain("from public, anon;");
    expect(sql).toContain("to authenticated;");
  });
});
