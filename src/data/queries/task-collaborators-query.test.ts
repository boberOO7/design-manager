import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const tasksQueryPath = new URL("./tasks.ts", import.meta.url);
const dashboardQueryPath = new URL("./dashboard.ts", import.meta.url);

describe("personal task co-assignee queries", () => {
  it("loads co-assignees with project tasks and includes them in My Tasks without N+1 lookups", async () => {
    const source = await readFile(tasksQueryPath, "utf8");

    expect(source).toContain("collaborators:task_collaborators");
    expect(source).toContain("task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey");
    expect(source).toContain("normalizeTaskCollaborators");
    expect(source).toContain('supabase.rpc("get_personal_task_ids")');
    expect(source).toContain('.in("id", personalTaskIds.map((row) => row.task_id))');
    expect(source).not.toContain("Promise.all(data.map");
  });

  it("treats co-assignment as dashboard relevance while preserving the primary assignee field", async () => {
    const source = await readFile(dashboardQueryPath, "utf8");

    expect(source).toContain("task.collaborators.some");
    expect(source).toContain("task.assignee_id === profile.id");
  });
});
