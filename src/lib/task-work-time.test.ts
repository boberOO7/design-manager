import { describe, expect, it } from "vitest";
import { buildTaskWorkStatistics, buildWorkStatistics, filterTaskWorkStatistics, summarizeTaskTime, type DatedWorkLogEntry, type TaskWorkContext } from "./work-log";

const range = { from: "2026-10-01", through: "2026-10-31" };
const task: TaskWorkContext = { id: "task", title: "Task", project_id: "project", projectName: "Project", stage: "stage_1", stageName: "Planning", directionId: "direction", directionName: "Interior" };
const entry = (changes: Partial<DatedWorkLogEntry> = {}): DatedWorkLogEntry => ({ id: "work", user_id: "worker", work_date: range.from, task_id: task.id, activity_kind: "task", review_round_id: null, minutes: 60, ...changes });
const filters = { projectId: "", directionId: "", stage: "", employeeId: "" };

describe("task time from the existing work log", () => {
  it("sums simultaneous employees and separate review rounds once, with dated breakdowns", () => {
    const work = entry();
    const rows = [work, work, entry({ id: "collaborator", user_id: "colleague", minutes: 40 }),
      entry({ id: "review", activity_kind: "review", review_round_id: "round", minutes: 20 }),
      entry({ id: "review-again", activity_kind: "review", review_round_id: "round-2", minutes: 15, work_date: "2026-10-02" })];
    const summary = summarizeTaskTime(rows);
    expect(summary).toMatchObject({ totalMinutes: 135, taskMinutes: 100, reviewMinutes: 35 });
    expect(summary.employees).toHaveLength(2);
    expect(summary.employees[0]).toMatchObject({ id: "worker", totalMinutes: 95, days: [
      { date: "2026-10-02", totalMinutes: 15 }, { date: "2026-10-01", totalMinutes: 80 },
    ] });
    const report = buildWorkStatistics(rows.map(row => ({ ...row, project_id: "project" })), [], [], range, [], [], [task]);
    expect(report.tasks[0].totalMinutes).toBe(report.projects[0].totalMinutes);
    expect(report.tasks[0].totalMinutes).toBe(report.totals.totalMinutes);
  });

  it("uses inclusive actual work dates and retains work across repeated completion cycles", () => {
    const rows = [entry({ id: "before", work_date: "2026-09-30", minutes: 500 }), entry(),
      entry({ id: "reopened", work_date: "2026-10-31", minutes: 25 }), entry({ id: "after", work_date: "2026-11-01", minutes: 500 })];
    expect(buildTaskWorkStatistics(rows, range, [task])[0].totalMinutes).toBe(85);
    expect(summarizeTaskTime(rows).totalMinutes).toBe(1085);
  });

  it("never assigns unlinked or internal time, or invents unavailable task context", () => {
    const rows = [entry(), entry({ id: "unlinked", task_id: null, minutes: 90 }),
      entry({ id: "internal", activity_kind: "internal", task_id: null, internal_activity_type: "team_walkthrough", minutes: 45 }),
      entry({ id: "unavailable", task_id: "unavailable", minutes: 20 })];
    expect(buildTaskWorkStatistics(rows, range, [task])).toMatchObject([{ id: task.id, totalMinutes: 60 }]);
    expect(summarizeTaskTime(rows.filter(row => row.task_id === task.id)).totalMinutes).toBe(60);
    expect(summarizeTaskTime([])).toMatchObject({ totalMinutes: 0, employees: [] });
  });

  it("filters every dimension and counts only the selected employee's contribution", () => {
    const second = { ...task, id: "other", title: "Other", directionId: "other-direction", stage: "stage_2" };
    const tasks = buildTaskWorkStatistics([entry(), entry({ id: "peer", user_id: "peer", minutes: 120 }),
      entry({ id: "second", task_id: second.id, minutes: 20 })], range, [task, second]);
    expect(filterTaskWorkStatistics(tasks, filters).map(row => row.totalMinutes)).toEqual([180, 20]);
    expect(filterTaskWorkStatistics(tasks, filters, true).map(row => row.totalMinutes)).toEqual([20, 180]);
    expect(filterTaskWorkStatistics(tasks, { ...filters, employeeId: "peer" })).toMatchObject([{ id: task.id, totalMinutes: 120, employees: [{ id: "peer" }] }]);
    expect(filterTaskWorkStatistics(tasks, { ...filters, directionId: "direction", stage: "project:stage_1", projectId: "project" })).toHaveLength(1);
    for (const change of [{ projectId: "missing" }, { directionId: "missing" }, { stage: "missing" }, { employeeId: "missing" }]) {
      expect(filterTaskWorkStatistics(tasks, { ...filters, ...change })).toEqual([]);
    }
  });
});
