import { describe, expect, it } from "vitest";
import {
  PRODUCTIVITY_STAGE_RATIOS,
  allocateRemainingStageBudget,
  doesTaskCompletionRequireProductivityAttribution,
  getProductivityStageMode,
  getProductivityWorkloadAreaByTask,
  getTaskCreationProgressField,
} from "./productivity";

describe("stage productivity accounting", () => {
  it("centralizes the Stage 1 and Stage 3 project-area ratios", () => {
    expect(PRODUCTIVITY_STAGE_RATIOS).toEqual({ stage_1: 0.20, stage_3: 0.80 });
    expect(120 * PRODUCTIVITY_STAGE_RATIOS.stage_1).toBe(24);
    expect(120 * PRODUCTIVITY_STAGE_RATIOS.stage_3).toBe(96);
  });

  it("keeps Stage 2 as task-area productivity and excludes Stage 4", () => {
    expect(getProductivityStageMode("stage_2")).toBe("task_area");
    expect(doesTaskCompletionRequireProductivityAttribution({ stage: "stage_2", completedAreaM2: 42, projectAreaM2: 120 })).toBe(true);
    expect(doesTaskCompletionRequireProductivityAttribution({ stage: "stage_4", completedAreaM2: 42, projectAreaM2: 120 })).toBe(false);
  });

  it("uses the same canonical stage modes for Create Task progress inputs", () => {
    expect(getTaskCreationProgressField("stage_1")).toBe("weight");
    expect(getTaskCreationProgressField("stage_2")).toBe("area");
    expect(getTaskCreationProgressField("stage_3")).toBe("weight");
    expect(getTaskCreationProgressField("stage_4")).toBeNull();
  });

  it("allocates only the remaining Stage 3 budget when tasks are added after a completion", () => {
    const firstSnapshot = allocateRemainingStageBudget({
      productivityBudgetM2: 96,
      allocatedProductivityM2: 0,
      remainingEligibleUnsnapshottedTasks: 10,
    });
    const nextSnapshot = allocateRemainingStageBudget({
      productivityBudgetM2: 96,
      allocatedProductivityM2: firstSnapshot,
      remainingEligibleUnsnapshottedTasks: 14,
    });

    expect(firstSnapshot).toBe(9.6);
    expect(nextSnapshot).toBeCloseTo(86.4 / 14);
    expect(firstSnapshot).toBe(9.6);
    expect(firstSnapshot + nextSnapshot * 14).toBeCloseTo(96);
  });

  it("does not reserve budget for cancelled tasks and safely handles zero-area stages", () => {
    expect(allocateRemainingStageBudget({
      productivityBudgetM2: 96,
      allocatedProductivityM2: 0,
      remainingEligibleUnsnapshottedTasks: 4,
    })).toBe(24);
    expect(allocateRemainingStageBudget({
      productivityBudgetM2: 0,
      allocatedProductivityM2: 0,
      remainingEligibleUnsnapshottedTasks: 4,
    })).toBe(0);
  });

  it("counts full unfinished area regardless of progress and excludes ineligible work", () => {
    type WorkTask = Parameters<typeof getProductivityWorkloadAreaByTask>[0][number] & { production_completion: number };
    const task = (id: string, overrides: Partial<WorkTask> = {}): WorkTask => ({ id, project_id: "p1", stage: "stage_2", status: "in_progress", assignee_id: "u1", completed_area_m2: 10, productivity_area_m2: null, production_completion: 0, ...overrides });
    const tasks = [
      task("zero"), task("half", { production_completion: 50 }), task("ninety", { production_completion: 90 }),
      task("done", { status: "completed" }), task("cancelled", { status: "cancelled" }),
      task("excluded", { project_id: "p2" }), task("unassigned", { assignee_id: null }),
      task("inactive-assignment", { assignee_id: "u2" }), task("nonproductive", { stage: "stage_4" }),
      task("reopened", { stage: "stage_1", productivity_area_m2: 7 }),
      task("new-stage-1", { stage: "stage_1", completed_area_m2: null }),
      task("other-person", { stage: "stage_1", assignee_id: "u2", completed_area_m2: null }),
    ];
    const areas = getProductivityWorkloadAreaByTask(tasks, [
      { id: "p1", total_area_m2: 100, include_in_productivity: true },
      { id: "p2", total_area_m2: 100, include_in_productivity: false },
    ], [], new Set(["p1:u1"]));
    expect([areas.get("zero"), areas.get("half"), areas.get("ninety")]).toEqual([10, 10, 10]);
    for (const id of ["done", "cancelled", "excluded", "unassigned", "inactive-assignment", "nonproductive", "other-person"]) expect(areas.has(id)).toBe(false);
    expect(areas.get("reopened")).toBe(7);
    expect(areas.get("new-stage-1")).toBeCloseTo(10); // 20 m² stage budget / two unsnapshotted tasks.
  });

  it("uses the persisted unallocated stage budget for unfinished tasks", () => {
    const tasks = [
      { id: "a", project_id: "p1", stage: "stage_3" as const, status: "review", assignee_id: "u1", completed_area_m2: null, productivity_area_m2: null },
      { id: "b", project_id: "p1", stage: "stage_3" as const, status: "todo", assignee_id: "u1", completed_area_m2: null, productivity_area_m2: null },
    ];
    const areas = getProductivityWorkloadAreaByTask(tasks, [{ id: "p1", total_area_m2: 200, include_in_productivity: true }], [
      { project_id: "p1", stage: "stage_3", productivity_budget_m2: 80, allocated_productivity_m2: 30 },
    ], new Set(["p1:u1"]));
    expect(areas.get("a")).toBe(25);
    expect(areas.get("b")).toBe(25);
  });

  it("treats a frozen snapshot as independent from later project-area changes", () => {
    const snapshotAtCompletion = allocateRemainingStageBudget({
      productivityBudgetM2: 24,
      allocatedProductivityM2: 0,
      remainingEligibleUnsnapshottedTasks: 3,
    });
    expect(snapshotAtCompletion).toBe(8);
    expect(snapshotAtCompletion).toBe(8);
  });
});
