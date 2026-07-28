import { describe, expect, it } from "vitest";
import { calculatePersonalProgress, calculateProjectProgress, getProjectHealth } from "./project-progress";

function task(overrides: Partial<{ id: string; status: string; priority: string; due_date: string | null; assignee_id: string | null }> = {}) {
  return { id: "task-1", status: "todo", priority: "normal", due_date: null, assignee_id: "employee-1", ...overrides };
}

describe("project task progress", () => {
  it("excludes cancelled tasks and returns null progress with no eligible tasks", () => {
    expect(calculateProjectProgress([task({ status: "cancelled" })], "2026-07-28")).toMatchObject({ eligibleTaskCount: 0, completedTaskCount: 0, progressPercent: null });
  });

  it("rounds task-derived progress and counts workflow statuses consistently", () => {
    const progress = calculateProjectProgress([task({ id: "todo" }), task({ id: "progress", status: "in_progress" }), task({ id: "review", status: "review" }), task({ id: "done", status: "completed" }), task({ id: "cancelled", status: "cancelled" })], "2026-07-28");
    expect(progress).toMatchObject({ eligibleTaskCount: 4, completedTaskCount: 1, openTaskCount: 3, todoTaskCount: 1, inProgressTaskCount: 2, progressPercent: 25 });
  });

  it("never treats completed tasks as overdue and uses date-only due dates", () => {
    const progress = calculateProjectProgress([task({ id: "old-open", due_date: "2026-07-27" }), task({ id: "old-done", status: "completed", due_date: "2026-07-27" }), task({ id: "today", due_date: "2026-07-28" })], "2026-07-28");
    expect(progress.overdueTaskCount).toBe(1);
    expect(progress.nearestOpenTaskDueDate).toBe("2026-07-27");
  });

  it("deduplicates joined task rows and calculates personal contribution", () => {
    const tasks = [task({ id: "same", status: "completed" }), task({ id: "same", status: "completed" }), task({ id: "other", assignee_id: "employee-2" })];
    expect(calculateProjectProgress(tasks, "2026-07-28")).toMatchObject({ eligibleTaskCount: 2, completedTaskCount: 1, progressPercent: 50 });
    expect(calculatePersonalProgress(tasks, "employee-1", "2026-07-28")).toEqual({ eligibleTaskCount: 1, completedTaskCount: 1, progressPercent: 100 });
  });

  it("does not fake 100 percent when a completed project has unfinished tasks", () => {
    expect(calculateProjectProgress([task({ id: "done", status: "completed" }), task({ id: "open" })], "2026-07-28").progressPercent).toBe(50);
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
  it("puts task attention ahead of a deadline soon", () => {
    const progress = calculateProjectProgress([task({ priority: "high" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-08-01", progress, today: "2026-07-28" }).health).toBe("needs_attention");
  });
  it("uses deadline soon before on track and identifies urgent open work", () => {
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: "2026-08-04", progress: normal, today: "2026-07-28" }).health).toBe("deadline_soon");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: null, progress: normal, today: "2026-07-28" }).health).toBe("on_track");
    const urgent = calculateProjectProgress([task({ priority: "urgent" })], "2026-07-28");
    expect(getProjectHealth({ projectStatus: "active", projectDueDate: null, progress: urgent, today: "2026-07-28" }).health).toBe("needs_attention");
  });
});
