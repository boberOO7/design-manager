import { describe, expect, it } from "vitest";
import {
  PRODUCTIVITY_STAGE_RATIOS,
  doesTaskCompletionRequireProductivityAttribution,
  getProductivityStageMode,
  getProductivityWorkloadAreaByTask,
  getTaskCreationProgressField,
} from "./productivity";

describe("stage productivity accounting", () => {
  it("keeps the established stage modes and ratios", () => {
    expect(PRODUCTIVITY_STAGE_RATIOS).toEqual({ stage_1: 0.20, stage_3: 0.80 });
    expect(getProductivityStageMode("stage_2")).toBe("task_area");
    expect(getProductivityStageMode("stage_4")).toBe("none");
    expect(getTaskCreationProgressField("stage_1")).toBe("weight");
    expect(getTaskCreationProgressField("stage_2")).toBe("area");
    expect(getTaskCreationProgressField("stage_3")).toBe("weight");
    expect(getTaskCreationProgressField("stage_4")).toBeNull();
    expect(doesTaskCompletionRequireProductivityAttribution({ stage: "stage_2", completedAreaM2: 42, projectAreaM2: 120 })).toBe(true);
    expect(doesTaskCompletionRequireProductivityAttribution({ stage: "stage_4", completedAreaM2: 42, projectAreaM2: 120 })).toBe(false);
  });

  it("estimates unfinished Stage 1/3 work from every non-cancelled task in its stage", () => {
    type WorkTask = Parameters<typeof getProductivityWorkloadAreaByTask>[0][number];
    const task = (id: string, overrides: Partial<WorkTask> = {}): WorkTask => ({ id, project_id: "p1", stage: "stage_1", status: "todo", assignee_id: "u1", completed_area_m2: null, productivity_area_m2: null, ...overrides });
    const tasks = [
      task("first", { status: "completed", productivity_area_m2: 20 }),
      task("second", { productivity_area_m2: 20 }),
      task("third", { assignee_id: "u2" }),
      task("cancelled", { status: "cancelled" }),
      task("stage-three", { stage: "stage_3", productivity_area_m2: 80 }),
      task("task-area", { stage: "stage_2", completed_area_m2: 8 }),
      task("excluded", { project_id: "p2" }),
      task("unassigned", { assignee_id: null }),
    ];
    const areas = getProductivityWorkloadAreaByTask(tasks, [
      { id: "p1", total_area_m2: 100, include_in_productivity: true },
      { id: "p2", total_area_m2: 100, include_in_productivity: false },
    ], new Set(["p1:u1"]));
    expect(areas.get("second")).toBe(5); // Four eligible Stage 1 tasks, including completed and unassigned.
    expect(areas.get("stage-three")).toBe(80);
    expect(areas.get("task-area")).toBe(8);
    for (const id of ["first", "third", "cancelled", "excluded", "unassigned"]) expect(areas.has(id)).toBe(false);
  });

  it.each([0, 30, 37.5, 100])("uses the studio's %s%% share for workload without changing task-area or custom-stage accounting", (percent) => {
    const tasks = (["stage_1", "stage_3", "stage_2", "custom_12345678-1234-1234-1234-123456789abc"] as const).map(stage => ({ id: stage, project_id: "p1", stage, status: "todo", assignee_id: "u1", completed_area_m2: 12, productivity_area_m2: null }));
    const areas = getProductivityWorkloadAreaByTask(tasks, [{ id: "p1", total_area_m2: 100, include_in_productivity: true }], new Set(["p1:u1"]), percent);
    expect(areas.get("stage_1") ?? 0).toBe(percent);
    expect(areas.get("stage_3") ?? 0).toBe(100 - percent);
    expect(areas.get("stage_2")).toBe(12);
    expect(areas.has(tasks[3].id)).toBe(false);
  });
});
