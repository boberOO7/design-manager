import { describe, expect, it } from "vitest";
import {
  PRODUCTIVITY_STAGE_RATIOS,
  allocateRemainingStageBudget,
  doesTaskCompletionRequireProductivityAttribution,
  getProductivityStageMode,
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
