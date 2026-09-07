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

describe("task board multi-selection", () => {
  it("keeps modifier selection, selected semantics, context actions, and grouped dragging on the shared board paths", async () => {
    const source = await readFile(boardPath, "utf8");

    expect(source).toContain("event.ctrlKey || event.metaKey");
    expect(source).toContain("if (event.ctrlKey || event.metaKey) return true;");
    expect(source).toContain("aria-pressed={isSelected}");
    expect(source).toContain("onContextMenu={(event) => onContextMenu(event, task)}");
    expect(source).toContain('kind: "selection"');
    expect(source).toContain("getBulkMoveBatch");
    expect(source).toContain('(isDragging || isGroupDragging) && "cursor-grabbing opacity-30"');
    expect(source).toContain("previewOffset: getBulkPreviewOffset(event)");
    expect(source).toContain('pluralCategory === "few" ? "задачі"');
    expect(source).toContain('`Перемістити ${formatTaskCount(activeBulkDrag.taskIds.length, locale)}`');
    expect(source).not.toContain('activeBulkDrag.kind === "selection") return <div');
    expect(source).toContain("Призначити виконавця");
    expect(source).toContain("Встановити дедлайн");
    expect(source).toContain("Перемістити до…");
    expect(source).toContain("Зняти вибір");
    expect(source).toContain("TASK_MILESTONE_STATUSES.filter");
  });
});
