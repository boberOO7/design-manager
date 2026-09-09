import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../../supabase/migrations/20260821121000_fix_bulk_task_stage_assignment_id_ambiguity.sql", import.meta.url);
const privilegeMigrationPath = new URL(
  "../../../supabase/migrations/20260909122819_restore_project_progress_stage_authenticated_execute.sql",
  import.meta.url,
);
const membershipGuardMigrationPath = new URL(
  "../../../supabase/migrations/20260909123316_keep_bulk_stage_active_assignee_guard_private.sql",
  import.meta.url,
);
const mutationPath = new URL("./task-status.ts", import.meta.url);
const boardPath = new URL("../../components/tasks/project-task-board.tsx", import.meta.url);
const routePath = new URL("../../app/api/projects/[projectId]/tasks/bulk-assignee/route.ts", import.meta.url);

describe("bulk task stage assignment contract", () => {
  it("uses the atomic assignment RPC and leaves task triggers authoritative", async () => {
    const [migration, privilegeMigration, membershipGuardMigration, mutation, route] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(privilegeMigrationPath, "utf8"),
      readFile(membershipGuardMigrationPath, "utf8"),
      readFile(mutationPath, "utf8"),
      readFile(routePath, "utf8"),
    ]);

    expect(migration).toContain("bulk_assign_project_stage_tasks");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("for update");
    expect(migration).toContain("task.status <> 'cancelled'");
    expect(migration).toContain("private.is_studio_admin");
    expect(migration).toContain("select task.id as task_id");
    expect(migration).toContain("array_agg(source_task.task_id)");
    expect(privilegeMigration).toContain("revoke execute on function private.is_project_progress_stage(text)");
    expect(privilegeMigration).toContain("from public, anon;");
    expect(privilegeMigration).toContain("grant execute on function private.is_project_progress_stage(text)");
    expect(privilegeMigration).toContain("to authenticated;");
    expect(membershipGuardMigration).toContain("security invoker");
    expect(membershipGuardMigration).toContain("from public.project_members as assignment");
    expect(membershipGuardMigration).not.toContain("private.is_active_project_task_assignee(p_project_id, p_assignee_id)");
    expect(mutation).toContain('supabase.rpc("bulk_assign_project_stage_tasks"');
    expect(route).toContain("bulkAssignTaskStageMutation(projectId, body)");
  });

  it("keeps the current user exclusive to the dedicated assignment shortcut", async () => {
    const board = await readFile(boardPath, "utf8");

    expect(board).toContain("member.id !== currentUserId && member.full_name");
    expect(board).toContain("const currentMember = members.find((member) => member.id === currentUserId)");
  });
});
