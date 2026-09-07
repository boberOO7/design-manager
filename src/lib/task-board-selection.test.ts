import { describe, expect, it } from "vitest";
import { getBulkMoveBatch, toggleTaskBoardSelection, type TaskBoardSelection } from "./task-board-selection";

describe("task board selection", () => {
  it("toggles task ids and replaces the selection when another stage is used", () => {
    const empty: TaskBoardSelection = { stage: null, taskIds: [] };
    const first = toggleTaskBoardSelection(empty, { id: "one", stage: "stage_1" });
    const second = toggleTaskBoardSelection(first, { id: "two", stage: "stage_1" });
    expect(second).toEqual({ stage: "stage_1", taskIds: ["one", "two"] });
    expect(toggleTaskBoardSelection(second, { id: "one", stage: "stage_1" })).toEqual({ stage: "stage_1", taskIds: ["two"] });
    expect(toggleTaskBoardSelection(second, { id: "three", stage: "stage_2" })).toEqual({ stage: "stage_2", taskIds: ["three"] });
  });

  it("builds an exact cross-column move batch and excludes tasks already at the destination", () => {
    const tasks = [
      { id: "one", stage: "stage_1" as const, status: "todo" },
      { id: "two", stage: "stage_1" as const, status: "in_progress" },
      { id: "three", stage: "stage_1" as const, status: "review" },
    ];
    expect(getBulkMoveBatch(tasks, { stage: "stage_1", taskIds: ["one", "two", "three"] }, "review")).toEqual({
      stage: "stage_1",
      sourceStatuses: ["todo", "in_progress"],
      taskIds: ["one", "two"],
    });
  });

  it("rejects stale or mixed-stage selections", () => {
    expect(getBulkMoveBatch([{ id: "one", stage: "stage_1", status: "todo" }], { stage: "stage_1", taskIds: ["missing"] }, "review")).toBeNull();
    expect(getBulkMoveBatch([{ id: "one", stage: "stage_2", status: "todo" }], { stage: "stage_1", taskIds: ["one"] }, "review")).toBeNull();
  });
});
