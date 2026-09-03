import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const boardPath = new URL("./project-task-board.tsx", import.meta.url);

describe("task-card assignee presentation", () => {
  it("keeps the primary responsible assignee distinct from co-assignees and restores the empty avatar", async () => {
    const source = await readFile(boardPath, "utf8");

    expect(source).toContain("const hasTaskParticipants = task.assignee !== null || task.collaborators.length > 0;");
    expect(source).toContain('<UserAvatar decorative size="boardCard" />');
    expect(source).toContain('{task.assignee?.full_name ?? t("unassigned")}');
    expect(source).not.toContain('task.assignee?.full_name ?? task.collaborators?.[0]?.full_name');
    expect(source).toContain("const visibleCollaboratorCount = task.assignee ? 3 : 4;");
  });
});

describe("completed-project task creation", () => {
  it("keeps the general action visible and shares canonical allowed stages with local stage actions", async () => {
    const source = await readFile(boardPath, "utf8");

    expect(source).toContain("getTaskCreationStagesForProject({ projectStatus })");
    expect(source).toContain("canCreate && defaultTaskCreationStage");
    expect(source).toContain("allowedStages={taskCreationStages}");
    expect(source).toContain("defaultStage={defaultTaskCreationStage}");
    expect(source).toContain("canCreate && taskCreationStages.includes(stage)");
    expect(source).not.toContain('canCreate && projectStatus !== "completed"');
  });
});
