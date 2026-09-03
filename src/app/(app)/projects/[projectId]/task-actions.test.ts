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

describe("project task creation progress contract", () => {
  it("uses the project stage configuration to persist only the applicable progress input", async () => {
    const source = await readFile(actionsPath, "utf8");
    const createAction = source.slice(source.indexOf("export async function createProjectTask"), source.indexOf("export async function updateTaskStatus"));

    expect(createAction).toContain("getProjectStageConfiguration(project.id)");
    expect(createAction).toContain("getTaskCreationProgressField(parsed.data.stage)");
    expect(createAction).toContain('progressField === "area" ? { completed_area_m2: parsed.data.completed_area_m2 ?? null } : {}');
    expect(createAction).toContain('progressField === "weight" ? { progress_weight: parsed.data.progress_weight ?? 1 } : {}');
  });

  it("checks lifecycle and stage eligibility server-side after rejecting archived projects", async () => {
    const source = await readFile(actionsPath, "utf8");
    const createAction = source.slice(source.indexOf("export async function createProjectTask"), source.indexOf("export async function updateTaskStatus"));

    expect(createAction).toContain('project.status === "archived"');
    expect(createAction).toContain("project.archived_at");
    expect(createAction).toContain("canWorkOnTaskInProject({ projectStatus: project.status, archivedAt: project.archived_at, stage: parsed.data.stage })");
    expect(createAction).toContain("Only the post-completion stage accepts new tasks after project completion.");
  });
});
