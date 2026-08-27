import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260827120000_task_collaborators.sql", import.meta.url);
const productivityMigrationPath = new URL("../../supabase/migrations/20260825103801_stage_productivity_accounting.sql", import.meta.url);

describe("task co-assignees migration contract", () => {
  it("persists unique participants with cleanup and keeps primary assignment exclusive", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("primary key (task_id, user_id)");
    expect(sql).toContain("references public.tasks(id) on delete cascade");
    expect(sql).toContain("references public.profiles(id) on delete cascade");
    expect(sql).toContain("Primary assignee cannot also be a co-assignee");
    expect(sql).toContain("array_remove(p_collaborator_ids");
    expect(sql).toContain("on conflict (task_id, user_id) do nothing");
  });

  it("uses one atomic admin-authorized mutation and not a client-side replacement sequence", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("update_task_details_with_collaborators");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("private.is_studio_admin");
    expect(sql).toContain("delete from public.task_collaborators");
    expect(sql).toContain("insert into public.task_collaborators");
  });

  it("notifies newly added collaborators and avoids productivity attribution changes", async () => {
    const [sql, productivitySql] = await Promise.all([readFile(migrationPath, "utf8"), readFile(productivityMigrationPath, "utf8")]);

    expect(sql).toContain("notify_task_collaborator_after_insert");
    expect(sql).toContain("task_assigned");
    expect(sql).not.toContain("task_productivity_attributions");
    expect(productivitySql).toContain("new.assignee_id");
    expect(productivitySql).toContain("new.project_id, new.id, new.assignee_id, 'task', snapshot_area");
    expect(productivitySql).not.toContain("task_collaborators");
  });
});
