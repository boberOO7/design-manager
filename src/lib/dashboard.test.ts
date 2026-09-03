import { describe, expect, it } from "vitest";
import { countDueThisWeek, countDueToday, countUpcomingSevenDays, getEmployeeTasksNeedingAttention, getProjectsRequiringAttention, getTeamWorkload, isDashboardTask, isDashboardTaskProjectEligible, isOpenTask, sortEmployeeTasks, type DashboardProject, type DashboardTask } from "./dashboard";
import { isTaskOverdue } from "./tasks";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } from "./project-progress";

const today = "2026-07-27";
const project: DashboardProject = { id: "p1", name: "Alpha", project_code: null, client_name: null, due_date: null, status: "active", stageProgressMethods: DEFAULT_PROJECT_STAGE_PROGRESS_METHODS };
function task(overrides: Partial<DashboardTask> = {}): DashboardTask {
  const value: DashboardTask = { id: "t1", project_id: "p1", stage: "stage_1", title: "Task", description: null, status: "todo", priority: "normal", assignee_id: "u1", due_date: null, completed_at: null, completed_area_m2: null, manual_progress_override: false, production_completion: 0, progress_weight: 1, checklist_items: [], created_at: "2026-07-01T12:00:00Z", created_by: "admin", assignee: null, collaborators: [], creator: null, project: { id: "p1", name: "Alpha", status: "active", archived_at: null }, ...overrides };
  return { ...value, deadlines: value.deadlines ?? (value.due_date ? [{ id: `deadline-${value.id}`, target_status: "completed", due_date: value.due_date }] : []) };
}

describe("dashboard calculations", () => {
  it("accepts canonical workflow stages and statuses only", () => {
    const dashboardTask = task({ status: "internal_review" });
    expect(isDashboardTask(dashboardTask)).toBe(true);
    expect(isDashboardTask({ ...dashboardTask, stage: "unsupported_stage" })).toBe(false);
    expect(isDashboardTask({ ...dashboardTask, status: "unsupported_status" })).toBe(false);
    expect(isDashboardTask({ ...dashboardTask, priority: "unsupported_priority" })).toBe(false);
  });

  it("includes only post-completion work from completed projects and keeps paused or archived work excluded", () => {
    expect(isDashboardTaskProjectEligible(task({ stage: "stage_4", project: { id: "p1", name: "Alpha", status: "completed", archived_at: null } }))).toBe(true);
    expect(isDashboardTaskProjectEligible(task({ stage: "stage_3", project: { id: "p1", name: "Alpha", status: "completed", archived_at: null } }))).toBe(false);
    expect(isDashboardTaskProjectEligible(task({ stage: "stage_4", project: { id: "p1", name: "Alpha", status: "paused", archived_at: null } }))).toBe(false);
    expect(isDashboardTaskProjectEligible(task({ stage: "stage_4", project: { id: "p1", name: "Alpha", status: "archived", archived_at: "2026-09-03" } }))).toBe(false);
  });

  it("excludes completed and cancelled tasks from open and overdue counts", () => {
    const tasks = [task({ id: "open", due_date: "2026-07-20" }), task({ id: "done", status: "completed", due_date: "2026-07-20" }), task({ id: "cancelled", status: "cancelled", due_date: "2026-07-20" })];
    expect(tasks.filter(isOpenTask)).toHaveLength(1);
    expect(isTaskOverdue(tasks[1], today)).toBe(false);
    expect(getTeamWorkload([{ id: "u1", full_name: "A", job_title: "Designer" }], tasks, today)[0].overdueCount).toBe(1);
  });
  it("counts due today, this calendar week, and the next seven days", () => {
    const tasks = [task({ id: "today", due_date: today }), task({ id: "week", due_date: "2026-08-02" }), task({ id: "next", due_date: "2026-08-03" }), task({ id: "done", status: "completed", due_date: today })];
    expect(countDueToday(tasks, today)).toBe(1); expect(countDueThisWeek(tasks, today)).toBe(2); expect(countUpcomingSevenDays(tasks, today)).toBe(2);
  });
  it("sorts employee work by overdue, today, urgent, high, then due date", () => {
    const sorted = sortEmployeeTasks([task({ id: "normal", due_date: "2026-08-01" }), task({ id: "high", priority: "high" }), task({ id: "urgent", priority: "urgent" }), task({ id: "today", due_date: today }), task({ id: "overdue", due_date: "2026-07-20" })], today);
    expect(sorted.map((item) => item.id)).toEqual(["overdue", "today", "urgent", "high", "normal"]);
  });
  it("includes only unfinished employee tasks that need attention", () => {
    const attention = getEmployeeTasksNeedingAttention([
      task({ id: "normal", priority: "normal" }),
      task({ id: "low", priority: "low" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "high", priority: "high" }),
      task({ id: "progress", status: "in_progress" }),
      task({ id: "internal", status: "internal_review" }),
      task({ id: "near", due_date: "2026-08-03" }),
      task({ id: "completed", status: "completed", priority: "urgent" }),
      task({ id: "cancelled", status: "cancelled", priority: "high" }),
    ], today);
    expect(attention.map((item) => item.id)).toEqual(["urgent", "high", "progress", "internal", "near"]);
  });
  it("orders needs-attention tasks by urgency, workflow, then due date and title", () => {
    const attention = getEmployeeTasksNeedingAttention([
      task({ id: "late", due_date: "2026-07-20" }),
      task({ id: "today", due_date: today }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "high", priority: "high" }),
      task({ id: "review", status: "review", title: "Zeta" }),
      task({ id: "internal", status: "internal_review", title: "Beta" }),
      task({ id: "progress", status: "in_progress", title: "Alpha" }),
      task({ id: "near", due_date: "2026-08-01" }),
    ], today);
    expect(attention.map((item) => item.id)).toEqual(["late", "today", "urgent", "high", "progress", "internal", "review", "near"]);
  });
  it("sorts attention projects and does not duplicate project summaries", () => {
    const projects = [{ ...project, due_date: "2026-08-01" }, { ...project, id: "p2", name: "Beta" }];
    const items = getProjectsRequiringAttention(projects, [task({ id: "t1", due_date: "2026-07-20" }), task({ id: "t2", priority: "urgent" }), task({ id: "t3", project_id: "p2", project: { id: "p2", name: "Beta", status: "active", archived_at: null }, priority: "high" })], today);
    expect(items.map((item) => item.id)).toEqual(["p1", "p2"]); expect(items[0].overdueCount).toBe(1);
  });
  it("aggregates team workload without duplicating tasks", () => {
    const workload = getTeamWorkload(
      [{ id: "u1", full_name: "A", job_title: "Designer" }, { id: "u2", full_name: "B", job_title: "Designer" }],
      [
        task({ id: "a", due_date: "2026-07-20" }),
        task({ id: "b", status: "in_progress", priority: "urgent" }),
        task({ id: "c", status: "review", assignee_id: "u2" }),
        task({ id: "internal", status: "internal_review", assignee_id: "u2" }),
        task({ id: "done", status: "completed", priority: "urgent", assignee_id: "u2" }),
      ],
      today,
    );
    expect(workload).toEqual([
      { id: "u1", full_name: "A", job_title: "Designer", openTaskCount: 2, todoCount: 1, inProgressCount: 1, reviewCount: 0, urgentCount: 1, overdueCount: 1 },
      { id: "u2", full_name: "B", job_title: "Designer", openTaskCount: 2, todoCount: 0, inProgressCount: 0, reviewCount: 2, urgentCount: 0, overdueCount: 0 },
    ]);
  });
  it("excludes unassigned work from individual workload metrics", () => {
    const workload = getTeamWorkload(
      [{ id: "u1", full_name: "A", job_title: "Designer" }],
      [task({ assignee_id: null, priority: "urgent", due_date: "2026-07-20" })],
      today,
    );
    expect(workload[0]).toMatchObject({ openTaskCount: 0, urgentCount: 0, overdueCount: 0 });
  });
});
