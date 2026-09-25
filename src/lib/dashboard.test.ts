import { describe, expect, it } from "vitest";
import { countDueThisWeek, countDueToday, countUpcomingSevenDays, getCurrentStatusAge, getCurrentStatusDuration, getEmployeeTasksNeedingAttention, getProjectsRequiringAttention, getTeamWorkload, isDashboardTask, isDashboardTaskProjectEligible, isOpenTask, isTaskInWorkloadCategory, selectAdminMyWork, selectAdminTaskMetrics, selectEmployeeTaskMetrics, selectEmployeeAttentionSummary, selectAdminUpcoming, sortEmployeeTasks, type AdminUpcomingItem, type DashboardProject, type DashboardTask } from "./dashboard";
import { isTaskOverdue } from "./tasks";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } from "./project-progress";

const today = "2026-07-27";
const project: DashboardProject = { id: "p1", name: "Alpha", project_code: null, client_name: null, due_date: null, status: "active", stageProgressMethods: DEFAULT_PROJECT_STAGE_PROGRESS_METHODS };
type WorkloadTestTask = DashboardTask & { currentStatusEnteredAt: string | null; workloadAreaM2: number };
function task(overrides: Partial<WorkloadTestTask> = {}): WorkloadTestTask {
  const value: WorkloadTestTask = { id: "t1", project_id: "p1", stage: "stage_1", title: "Task", description: null, status: "todo", priority: "normal", assignee_id: "u1", due_date: null, completed_at: null, completed_area_m2: null, manual_progress_override: false, production_completion: 0, progress_weight: 1, checklist_items: [], created_at: "2026-07-01T12:00:00Z", created_by: "admin", assignee: null, collaborators: [], creator: null, project: { id: "p1", name: "Alpha", status: "active", archived_at: null }, currentStatusEnteredAt: null, workloadAreaM2: 0, ...overrides };
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
  it("counts active, overdue and review tasks from current task state", () => {
    const tasks = [
      task({ id: "active", status: "in_progress", due_date: "2026-07-20" }),
      task({ id: "review", status: "internal_review" }),
      task({ id: "done", status: "completed", completed_at: "2026-07-01T21:00:00Z" }),
      task({ id: "previous", status: "completed", completed_at: "2026-06-30T20:59:59Z" }),
    ];
    expect(selectAdminTaskMetrics(tasks, today)).toEqual({ activeTasks: 1, overdueTasks: 1 });
    expect(selectEmployeeTaskMetrics(tasks, today)).toEqual({ inProgress: 1, inReview: 1, overdue: 1 });
  });
  it("summarizes employee exceptions once by overdue before task or Office priority", () => {
    const summary = selectEmployeeAttentionSummary([
      task({ id: "late-urgent", priority: "urgent", due_date: "2026-07-20" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "high", priority: "high" }),
      task({ id: "done", status: "completed", priority: "urgent" }),
    ], [
      { id: "office-late", title: "Late and urgent", deadline: "2026-07-20", priority: "urgent", status: "assigned" },
      { id: "office-urgent", title: "Urgent", deadline: "2026-07-29", priority: "urgent", status: "assigned" },
      { id: "office-normal", title: "Normal", deadline: "2026-07-29", priority: "normal", status: "assigned" },
    ], today);
    expect(summary).toEqual([
      { kind: "overdueTasks", count: 1 }, { kind: "urgentTasks", count: 2 },
      { kind: "overdueAssignments", count: 1 }, { kind: "urgentAssignments", count: 1 },
    ]);
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
    expect(workload).toMatchObject([
      { id: "u1", full_name: "A", job_title: "Designer", openTaskCount: 2, todoCount: 1, inProgressCount: 1, reviewCount: 0, urgentCount: 1, overdueCount: 1 },
      { id: "u2", full_name: "B", job_title: "Designer", openTaskCount: 2, todoCount: 0, inProgressCount: 0, reviewCount: 2, urgentCount: 0, overdueCount: 0 },
    ]);
  });
  it("reconciles each employee workload area with its contributing projects and tasks", () => {
    const workload = getTeamWorkload(
      [{ id: "u1", full_name: "A", job_title: "Designer" }, { id: "u2", full_name: "B", job_title: "Designer" }],
      [task({ id: "a", workloadAreaM2: 10 }), task({ id: "b", project_id: "p2", workloadAreaM2: 6.5 }), task({ id: "c", assignee_id: "u2", workloadAreaM2: 4 }), task({ id: "done", status: "completed", workloadAreaM2: 10 })],
      today,
    );
    expect(workload[0].workloadAreaM2).toBe(16.5);
    expect(workload[1].workloadAreaM2).toBe(4);
    const projectAreas = new Map<string, number>();
    for (const item of workload[0].tasks.filter((item) => item.workloadAreaM2 > 0)) projectAreas.set(item.project_id, (projectAreas.get(item.project_id) ?? 0) + item.workloadAreaM2);
    expect([...projectAreas.values()].reduce((sum, area) => sum + area, 0)).toBe(workload[0].workloadAreaM2);
    expect([...projectAreas]).toEqual([["p1", 10], ["p2", 6.5]]);
  });
  it("excludes unassigned work from individual workload metrics", () => {
    const workload = getTeamWorkload(
      [{ id: "u1", full_name: "A", job_title: "Designer" }],
      [task({ assignee_id: null, priority: "urgent", due_date: "2026-07-20" })],
      today,
    );
    expect(workload[0]).toMatchObject({ openTaskCount: 0, urgentCount: 0, overdueCount: 0 });
  });
  it("filters each workload counter to its underlying open tasks", () => {
    const tasks = [
      task({ id: "work", status: "in_progress" }),
      task({ id: "internal", status: "internal_review" }),
      task({ id: "review", status: "review", priority: "urgent" }),
      task({ id: "late", due_date: "2026-07-20" }),
      task({ id: "done", status: "completed", priority: "urgent", due_date: "2026-07-20" }),
    ];
    expect(tasks.filter((item) => isTaskInWorkloadCategory(item, "in_progress", today)).map((item) => item.id)).toEqual(["work"]);
    expect(tasks.filter((item) => isTaskInWorkloadCategory(item, "review", today)).map((item) => item.id)).toEqual(["internal", "review"]);
    expect(tasks.filter((item) => isTaskInWorkloadCategory(item, "urgent", today)).map((item) => item.id)).toEqual(["review"]);
    expect(tasks.filter((item) => isTaskInWorkloadCategory(item, "overdue", today)).map((item) => item.id)).toEqual(["late"]);
  });
  it("uses status history for recent focus and changes focus on re-entry", () => {
    const members = [{ id: "u1", full_name: "A", job_title: "Designer" }];
    const first = task({ id: "first", status: "in_progress", currentStatusEnteredAt: "2026-07-25T09:00:00Z" });
    const second = task({ id: "second", status: "in_progress", currentStatusEnteredAt: "2026-07-26T09:00:00Z" });
    const legacy = task({ id: "legacy", status: "in_progress", currentStatusEnteredAt: null });
    expect(getTeamWorkload(members, [first, second, legacy], today)[0].recentFocus?.id).toBe("second");
    expect(getTeamWorkload(members, [{ ...first, currentStatusEnteredAt: "2026-07-27T09:00:00Z" }, second, legacy], today)[0]).toMatchObject({ recentFocus: { id: "first" }, additionalInProgressCount: 2 });
  });
  it("derives current-status age only from a reliable entered-at timestamp", () => {
    expect(getCurrentStatusAge("2026-07-25T09:00:00Z", "2026-07-27T12:00:00Z")).toEqual({ unit: "days", value: 2 });
    expect(getCurrentStatusAge(null, "2026-07-27T12:00:00Z")).toBeNull();
    expect(getCurrentStatusAge("invalid", "2026-07-27T12:00:00Z")).toBeNull();
  });
  it("derives detailed status duration only from a reliable entered-at timestamp", () => {
    expect(getCurrentStatusDuration("2026-07-25T09:00:00Z", "2026-07-27T15:00:00Z")).toEqual({ days: 2, hours: 6 });
    expect(getCurrentStatusDuration(null, "2026-07-27T15:00:00Z")).toBeNull();
  });
  it("sorts the future admin feed chronologically before one overall limit", () => {
    const item = (key: string, kind: AdminUpcomingItem["kind"], date: string): AdminUpcomingItem => ({ key, kind, date, title: key, href: `/${key}` });
    const upcoming = selectAdminUpcoming([
      item("finance:late", "finance", "2026-07-26"),
      item("finance:1", "finance", "2026-07-27"),
      item("finance:2", "finance", "2026-07-27"),
      item("finance:3", "finance", "2026-07-27"),
      item("task:p1:first", "task", "2026-07-28"),
      item("task:p1:second", "task", "2026-07-29"),
      item("project:1", "project", "2026-07-30"),
      item("assignment:1", "assignment", "2026-07-31"),
      item("equipment:1", "equipment", "2026-08-01"),
      item("crm:1", "crm", "2026-08-02"),
    ], today, 8);
    expect(upcoming.map((entry) => entry.key)).toEqual(["finance:1", "finance:2", "finance:3", "task:p1:first", "task:p1:second", "project:1", "assignment:1", "equipment:1"]);
  });
  it("orders personal project tasks and Office assignments by overdue, priority, then date", () => {
    const items = selectAdminMyWork([
      task({ id: "task-undated", priority: "urgent" }),
      task({ id: "task-soon", due_date: "2026-07-29" }),
      task({ id: "task-late", due_date: "2026-07-25" }),
    ], [
      { id: "office-late", title: "Office late", deadline: "2026-07-26", priority: "normal", status: "assigned" },
      { id: "office-soon", title: "Office soon", deadline: "2026-07-28", priority: "high", status: "in_progress" },
      { id: "office-undated", title: "Office undated", deadline: null, priority: "normal", status: "assigned" },
    ], today, 6);
    const ids = items.map((item) => item.kind === "task" ? item.task.id : item.assignment.id);
    expect(ids).toEqual(["task-late", "office-late", "task-undated", "office-soon", "task-soon", "office-undated"]);
  });
});
