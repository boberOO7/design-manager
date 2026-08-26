import { describe, expect, it } from "vitest";
import { calculateOverallProjectProgress, calculatePersonalProgress, calculateProjectProgress, calculateStageProgress, calculateTaskProgress, getAutomaticTaskProgress, getProjectHealth, type ProjectTaskForProgress } from "./project-progress";

function task(overrides: Partial<ProjectTaskForProgress> = {}): ProjectTaskForProgress {
  return { id: "task-1", status: "todo", priority: "normal", due_date: null, assignee_id: "employee-1", completed_area_m2: null, manual_progress_override: false, production_completion: 0, progress_weight: 1, checklist_items: [], ...overrides };
}

describe("task progress", () => {
  it.each([
    ["todo", 0],
    ["in_progress", 50],
    ["internal_review", 80],
    ["review", 90],
    ["completed", 100],
    ["cancelled", 0],
  ])("maps automatic workflow statuses to their canonical progress", (status, expected) => {
    expect(calculateTaskProgress(task({ status, production_completion: 50 })).overallPercent).toBe(expected);
  });

  it.each([[0, 0], [25, 17.5], [50, 35], [75, 52.5], [100, 70]])("maps %s%% manual production to %s%% overall", (production, overall) => {
    expect(calculateTaskProgress(task({ status: "in_progress", manual_progress_override: true, production_completion: production }))).toMatchObject({ source: "manual", productionPercent: production, overallPercent: overall });
  });

  it("uses the source status only when returning to In progress", () => {
    expect(getAutomaticTaskProgress("todo", "in_progress")).toBe(50);
    expect(getAutomaticTaskProgress("internal_review", "in_progress")).toBe(70);
    expect(getAutomaticTaskProgress("review", "in_progress")).toBe(70);
    expect(getAutomaticTaskProgress("completed", "in_progress")).toBe(70);
    expect(getAutomaticTaskProgress("review", "internal_review")).toBe(80);
    expect(getAutomaticTaskProgress("completed", "review")).toBe(90);
    expect(getAutomaticTaskProgress("completed", "todo")).toBe(0);
  });

  it("uses weighted checklist completion and ignores the manual fallback while items exist", () => {
    const progress = calculateTaskProgress(task({ status: "in_progress", production_completion: 99, checklist_items: [{ id: "a", is_completed: true, weight: 1 }, { id: "b", is_completed: false, weight: 3 }] }));
    expect(progress).toMatchObject({ source: "checklist", productionPercent: 25, overallPercent: 50, completedChecklistCount: 1, checklistCount: 2 });
    expect(calculateTaskProgress(task({ status: "in_progress", production_completion: 37, checklist_items: [] })).productionPercent).toBe(37);
  });
});

describe("project task progress", () => {
  it("excludes cancelled tasks and returns zero progress with no eligible tasks", () => {
    expect(calculateProjectProgress([task({ status: "cancelled" })], "2026-07-28")).toMatchObject({ eligibleTaskCount: 0, completedTaskCount: 0, rawProgressPercent: 0, progressPercent: 0 });
  });

  it("uses weighted stage progress for partial completion", () => {
    const progress = calculateProjectProgress([
      { ...task({ id: "one-done", status: "completed" }), stage: "stage_1" },
      { ...task({ id: "one-open" }), stage: "stage_1" },
    ], "2026-07-28");
    expect(progress).toMatchObject({ eligibleTaskCount: 2, completedTaskCount: 1, openTaskCount: 1, rawProgressPercent: 10, progressPercent: 10 });
  });

  it("rounds the weighted overall result with the existing presentation rule", () => {
    const progress = calculateProjectProgress([
      { ...task({ id: "one-done", status: "completed" }), stage: "stage_1" },
      { ...task({ id: "one-open-a" }), stage: "stage_1" },
      { ...task({ id: "one-open-b" }), stage: "stage_1" },
    ]);
    expect(progress.rawProgressPercent).toBeCloseTo(6.6);
    expect(progress.progressPercent).toBe(7);
  });

  it("uses the fixed weighted formula from stage progress", () => {
    const progress = calculateProjectProgress([
      { ...task({ id: "one-done", status: "completed" }), stage: "stage_1" },
      { ...task({ id: "two-done", status: "completed" }), stage: "stage_2" },
      { ...task({ id: "two-open" }), stage: "stage_2" },
    ], "2026-07-28");
    expect(progress).toMatchObject({ rawProgressPercent: 40, progressPercent: 40 });
  });

  it("never treats completed tasks as overdue and uses date-only due dates", () => {
    const progress = calculateProjectProgress([task({ id: "old-open", due_date: "2026-07-27" }), task({ id: "old-done", status: "completed", due_date: "2026-07-27" }), task({ id: "today", due_date: "2026-07-28" })], "2026-07-28");
    expect(progress.overdueTaskCount).toBe(1);
    expect(progress.nearestOpenTaskDueDate).toBe("2026-07-27");
  });

  it("deduplicates joined task rows and calculates personal contribution", () => {
    const tasks = [{ ...task({ id: "same", status: "completed" }), stage: "stage_1" }, { ...task({ id: "same", status: "completed" }), stage: "stage_1" }, { ...task({ id: "other", assignee_id: "employee-2" }), stage: "stage_1" }];
    expect(calculateProjectProgress(tasks, "2026-07-28")).toMatchObject({ eligibleTaskCount: 2, completedTaskCount: 1, progressPercent: 10 });
    expect(calculatePersonalProgress(tasks, "employee-1", "2026-07-28")).toEqual({ eligibleTaskCount: 1, completedTaskCount: 1, progressPercent: 100 });
  });
});

describe("stage progress", () => {
  it("decreases stage and project progress when workflow work is returned", () => {
    const before = [
      { ...task({ id: "returned", status: "review" }), stage: "stage_1" },
      { ...task({ id: "steady", status: "completed" }), stage: "stage_1" },
    ];
    const after = [{ ...before[0], status: "in_progress", production_completion: 70 }, before[1]];
    expect(calculateStageProgress(before).stage_1.progressPercent).toBe(95);
    expect(calculateStageProgress(after).stage_1.progressPercent).toBe(85);
    expect(calculateProjectProgress(after).progressPercent).toBeLessThan(calculateProjectProgress(before).progressPercent);
  });

  it("uses the corrected manual production ceiling in stage and project aggregation", () => {
    const tasks = [{ ...task({ id: "manual", status: "in_progress", manual_progress_override: true, production_completion: 100 }), stage: "stage_1" }];
    expect(calculateStageProgress(tasks).stage_1.progressPercent).toBe(70);
    expect(calculateProjectProgress(tasks).progressPercent).toBe(14);
  });

  it("derives stage progress from canonical task progress and excludes cancelled tasks", () => {
    const progress = calculateStageProgress([
      { ...task({ id: "one-review", status: "review" }), stage: "stage_1" },
      { ...task({ id: "two-cancelled", status: "cancelled" }), stage: "stage_2" },
      { ...task({ id: "two-done", status: "completed" }), stage: "stage_2" },
      { ...task({ id: "two-review", status: "review" }), stage: "stage_2" },
      { ...task({ id: "four-done", status: "completed" }), stage: "stage_4" },
    ]);

    expect(progress).toEqual({
      stage_1: { eligibleTaskCount: 1, completedTaskCount: 0, progressPercent: 90, method: "equal" },
      stage_2: { eligibleTaskCount: 2, completedTaskCount: 1, progressPercent: 95, method: "equal" },
      stage_3: { eligibleTaskCount: 0, completedTaskCount: 0, progressPercent: 0, method: "equal" },
    });
  });

  it("uses task progress weights when a stage uses weighted aggregation", () => {
    const progress = calculateStageProgress([
      { ...task({ id: "done", status: "completed", progress_weight: 3 }), stage: "stage_2" },
      { ...task({ id: "review", status: "review", progress_weight: 1 }), stage: "stage_2" },
    ], { stage_1: "equal", stage_2: "weighted", stage_3: "equal" });
    expect(progress.stage_2).toMatchObject({ progressPercent: 98, method: "weighted" });
  });

  it("includes unassigned completed area work in area progress without personal attribution", () => {
    const tasks = [
      { ...task({ id: "done-unassigned", status: "completed", assignee_id: null, completed_area_m2: 100 }), stage: "stage_1" },
      { ...task({ id: "todo-unassigned", assignee_id: null, completed_area_m2: 100 }), stage: "stage_1" },
    ];

    expect(calculateStageProgress(tasks, { stage_1: "area", stage_2: "equal", stage_3: "equal" }).stage_1.progressPercent).toBe(50);
    expect(calculateProjectProgress(tasks, "2026-07-28", { stage_1: "area", stage_2: "equal", stage_3: "equal" }).progressPercent).toBe(10);
    expect(calculatePersonalProgress(tasks, "employee-1", "2026-07-28")).toEqual({
      eligibleTaskCount: 0,
      completedTaskCount: 0,
      progressPercent: null,
    });
  });

  it("calculates the weighted overall progress from stages one through three", () => {
    expect(calculateOverallProjectProgress({
      stage_1: { eligibleTaskCount: 1, completedTaskCount: 1, progressPercent: 100 },
      stage_2: { eligibleTaskCount: 2, completedTaskCount: 1, progressPercent: 50 },
      stage_3: { eligibleTaskCount: 0, completedTaskCount: 0, progressPercent: 0 },
    })).toBe(40);
  });

  it("reaches 100% only when all weighted stages are complete", () => {
    expect(calculateProjectProgress([
      { ...task({ id: "one", status: "completed" }), stage: "stage_1" },
      { ...task({ id: "two", status: "completed" }), stage: "stage_2" },
      { ...task({ id: "three", status: "completed" }), stage: "stage_3" },
    ]).progressPercent).toBe(100);
  });

  it("never lets stage four tasks affect overall project progress", () => {
    const progress = calculateProjectProgress([
      { ...task({ id: "one", status: "completed" }), stage: "stage_1" },
      ...Array.from({ length: 20 }, (_, index) => ({ ...task({ id: `four-${index}`, status: "completed" }), stage: "stage_4" })),
    ]);
    expect(progress.progressPercent).toBe(20);
  });
});

describe("project health precedence", () => {
  const normal = calculateProjectProgress([task({ id: "open" })], "2026-07-28");
  it("puts completed ahead of deadlines and task attention", () => {
    const progress = calculateProjectProgress([task({ due_date: "2026-07-01", priority: "urgent" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "completed", projectDueDate: "2026-07-01", progress, today: "2026-07-28" }).health).toBe("completed");
  });
  it("puts overdue project deadlines ahead of task attention", () => {
    const progress = calculateProjectProgress([task({ due_date: "2026-07-01", priority: "urgent" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-07-01", progress, today: "2026-07-28" }).health).toBe("overdue");
  });
  it("uses task attention and deadline-soon precedence", () => {
    const high = calculateProjectProgress([task({ priority: "high" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-08-01", progress: high, today: "2026-07-28" }).health).toBe("needs_attention");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-08-04", progress: normal, today: "2026-07-28" }).health).toBe("deadline_soon");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: null, progress: normal, today: "2026-07-28" }).health).toBe("on_track");
  });
  it("suppresses deadline and task risk while paused, then restores the stored risk on resume", () => {
    const atRisk = calculateProjectProgress([task({ due_date: "2026-07-01", priority: "urgent" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "paused", projectDueDate: "2026-07-01", progress: atRisk, today: "2026-07-28" })).toEqual({ health: "on_track", reason: null });
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-07-01", progress: atRisk, today: "2026-07-28" }).health).toBe("overdue");
  });
});
