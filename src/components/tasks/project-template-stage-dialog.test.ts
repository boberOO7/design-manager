import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const boardPath = new URL("./project-task-board.tsx", import.meta.url);
const dialogPath = new URL("./project-template-stage-dialog.tsx", import.meta.url);
const mutationPath = new URL("../../data/mutations/task-status.ts", import.meta.url);
const projectPagePath = new URL("../../app/(app)/projects/[projectId]/page.tsx", import.meta.url);

describe("project template stage UI", () => {
  it("opens from a writable destination stage and reconciles the returned project tasks", async () => {
    const source = await readFile(boardPath, "utf8");

    expect(source).toContain('const canApplyTemplate = canCreateInStage && localStageColumns[stage].includes("todo")');
    expect(source).toContain("setTemplateStage(stage)");
    expect(source).toContain("destinationStage={templateStage}");
    expect(source).toContain("localTasksRef.current = nextTasks; setLocalTasks(nextTasks)");
  });

  it("submits explicit source and destination stages and communicates append-only behavior", async () => {
    const source = await readFile(dialogPath, "utf8");

    expect(source).toContain("template_id: selectedTemplate.id, source_stage: sourceStage, destination_stage: destinationStage");
    expect(source).toContain('t("existingTasksRemain")');
    expect(source).toContain("getTemplateStageTasks(selectedTemplate, sourceStage)");
    expect(source).toContain("disabled={taskCount === 0}");
  });

  it("loads active studio project templates only for an administrator on the board", async () => {
    const source = await readFile(projectPagePath, "utf8");

    expect(source).toContain("view === \"board\" && canManage ? getStudioProjectTemplates() : Promise.resolve([])");
    expect(source).toContain("projectTemplates={projectTemplates}");
  });

  it("validates the request, uses the guarded RPC, and refreshes task consumers", async () => {
    const source = await readFile(mutationPath, "utf8");

    expect(source).toContain("projectTemplateStageApplicationSchema.safeParse");
    expect(source).toContain('supabase.rpc("apply_project_template_stage"');
    expect(source).toContain("const tasks = await getProjectTasks(parsed.data.project_id)");
    expect(source).toContain('revalidatePath("/projects")');
    expect(source).toContain('revalidatePath("/dashboard")');
  });
});
