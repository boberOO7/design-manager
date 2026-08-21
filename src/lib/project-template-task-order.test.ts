import { describe, expect, it } from "vitest";
import { getProjectTemplateTaskDestination, isProjectTemplateTaskDestinationChange, moveProjectTemplateTask } from "@/lib/project-template-task-order";
import type { ProjectTemplateTask } from "@/lib/project-templates";

function tasks(...ids: string[]): ProjectTemplateTask[] {
  return ids.map((id, position) => ({ id, title: id, stage: "stage_1", priority: "normal", position }));
}

function move(tasksBefore: ProjectTemplateTask[], sourceId: string, targetId: string | null, insertAfter: boolean) {
  const destination = getProjectTemplateTaskDestination(tasksBefore, sourceId, "stage_1", targetId, insertAfter);
  if (!destination) throw new Error("Expected a valid destination");
  return moveProjectTemplateTask(tasksBefore, sourceId, destination);
}

describe("project template task ordering", () => {
  it("recognizes no-op destinations without changing the shared destination calculation", () => {
    const ordered = tasks("A", "B", "C");
    const firstTaskPosition = getProjectTemplateTaskDestination(ordered, "A", "stage_1", "A", false);
    const secondTaskPosition = getProjectTemplateTaskDestination(ordered, "B", "stage_1", "B", true);
    const appendFirstTask = getProjectTemplateTaskDestination(ordered, "A", "stage_1", null, true);
    if (!firstTaskPosition || !secondTaskPosition || !appendFirstTask) throw new Error("Expected valid destinations");

    expect(isProjectTemplateTaskDestinationChange(ordered, "A", firstTaskPosition)).toBe(false);
    expect(isProjectTemplateTaskDestinationChange(ordered, "B", secondTaskPosition)).toBe(false);
    expect(appendFirstTask).toEqual({ stage: "stage_1", index: 2 });
    expect(isProjectTemplateTaskDestinationChange(ordered, "A", appendFirstTask)).toBe(true);

    const moveLastToStart = getProjectTemplateTaskDestination(ordered, "C", "stage_1", "A", false);
    if (!moveLastToStart) throw new Error("Expected a valid start destination");
    expect(moveLastToStart).toEqual({ stage: "stage_1", index: 0 });
    expect(isProjectTemplateTaskDestinationChange(ordered, "C", moveLastToStart)).toBe(true);
  });
  it("keeps stable task IDs draggable through repeated same-stage moves", () => {
    let ordered = tasks("A", "B", "C", "D");
    ordered = move(ordered, "A", "D", true);
    expect(ordered.map((task) => task.id)).toEqual(["B", "C", "D", "A"]);
    ordered = move(ordered, "B", "A", true);
    expect(ordered.map((task) => task.id)).toEqual(["C", "D", "A", "B"]);
    ordered = move(ordered, "A", "C", false);
    expect(ordered.map((task) => task.id)).toEqual(["A", "C", "D", "B"]);
    ordered = move(ordered, "D", "C", false);
    expect(ordered.map((task) => task.id)).toEqual(["A", "D", "C", "B"]);
    ordered = move(ordered, "C", "B", true);
    expect(ordered.map((task) => task.id)).toEqual(["A", "D", "B", "C"]);
    ordered = move(ordered, "C", "A", false);
    expect(ordered.map((task) => task.id)).toEqual(["C", "A", "D", "B"]);
    expect(ordered.map((task) => task.position)).toEqual([0, 1, 2, 3]);
    expect(new Set(ordered.map((task) => task.id)).size).toBe(4);
  });

  it("rejects cross-stage destinations while preserving the source stage", () => {
    const initial: ProjectTemplateTask[] = [
      ...tasks("A", "B"),
      { id: "C", title: "C", stage: "stage_2", priority: "normal", position: 0 },
      { id: "D", title: "D", stage: "stage_2", priority: "normal", position: 1 },
    ];
    const toStageTwo = getProjectTemplateTaskDestination(initial, "A", "stage_2", "D", true);
    expect(toStageTwo).toBeNull();
    expect(moveProjectTemplateTask(initial, "A", { stage: "stage_2", index: 2 })).toEqual(initial);
  });
});
