import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const actionsPath = new URL("./task-actions.ts", import.meta.url);

describe("project task deletion action contract", () => {
  it("requires the existing task authorization path to identify a studio administrator", async () => {
    const source = await readFile(actionsPath, "utf8");
    const deleteAction = source.slice(source.indexOf("export async function deleteProjectTask"));

    expect(deleteAction).toContain("authorizeTaskMutation(taskId)");
    expect(deleteAction).toContain("!authorization.isStudioAdmin");
    expect(deleteAction).toContain("Only active studio administrators can delete tasks.");
  });

  it("deletes only the authorized task and refreshes its task consumers", async () => {
    const source = await readFile(actionsPath, "utf8");
    const deleteAction = source.slice(source.indexOf("export async function deleteProjectTask"));

    expect(deleteAction).toContain('.from("tasks")');
    expect(deleteAction).toContain(".delete()");
    expect(deleteAction).toContain('.eq("id", authorization.task.id)');
    expect(deleteAction).toContain('.eq("project_id", authorization.task.project_id)');
    expect(deleteAction).toContain("revalidateTaskDeletionRoutes(authorization.task.project_id)");
    expect(source).toContain('revalidatePath("/dashboard")');
    expect(source).toContain('revalidatePath("/my-tasks")');
  });
});
