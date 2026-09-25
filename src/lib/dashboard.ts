import { isTaskFinished, isTaskInReview, isTaskOverdue, isTaskPriority, isTaskStatus } from "./tasks";
import type { MyTask, DashboardTaskSummary, DashboardWorkloadTask } from "../types/tasks";
import { canWorkOnTaskInProject, isOperationalProjectStatus, type ProjectLifecycleStatus } from "./project-lifecycle";
import { calculateProjectProgress, type ProjectStageProgressMethods } from "./project-progress";
import { isTaskStage } from "./task-stages";
import { isOfficeAssignmentOverdue, type OfficeAssignmentPriority, type OfficeAssignmentStatus } from "./office-assignments";

export type DashboardTask = MyTask;

export type DashboardProject = {
  id: string;
  name: string;
  project_code: string | null;
  client_name: string | null;
  due_date: string | null;
  status: ProjectLifecycleStatus;
  stageProgressMethods: ProjectStageProgressMethods;
};

export type DashboardMember = { id: string; full_name: string; job_title: string; avatar_url?: string | null };

export const WORKLOAD_CATEGORIES = ["todo", "in_progress", "review", "urgent", "overdue"] as const;
export type WorkloadCategory = (typeof WORKLOAD_CATEGORIES)[number];

export function isDashboardTask<T extends { project: DashboardTaskSummary["project"]; priority: string; stage: string; status: string }>(task: T): task is T & Pick<DashboardTaskSummary, "priority" | "stage" | "status"> {
  return Boolean(task.project)
    && isTaskStatus(task.status)
    && isTaskPriority(task.priority)
    && isTaskStage(task.stage);
}

export function isDashboardTaskProjectEligible(task: Pick<DashboardTask, "stage" | "project">): boolean {
  return isOperationalProjectStatus(task.project.status)
    || (task.project.status === "completed" && canWorkOnTaskInProject({
      projectStatus: task.project.status,
      archivedAt: task.project.archived_at,
      stage: task.stage,
    }));
}

export function getTodayDate(now = new Date()): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function getWeekEnd(today: string): string {
  const date = new Date(`${today}T12:00:00`);
  const daysUntilSunday = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysUntilSunday);
  return getTodayDate(date);
}

export function getDateDaysFrom(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + days);
  return getTodayDate(date);
}

export function isOpenTask(task: Pick<DashboardTask, "status">): boolean {
  return !isTaskFinished(task.status);
}

export function selectAdminTaskMetrics(tasks: DashboardTaskSummary[], today: string) {
  const open = tasks.filter(isOpenTask);
  return { activeTasks: open.filter((task) => task.status === "in_progress").length, overdueTasks: open.filter((task) => isTaskOverdue(task, today)).length };
}

export function selectEmployeeTaskMetrics(tasks: DashboardTaskSummary[], today: string) {
  const open = tasks.filter(isOpenTask);
  return {
    inProgress: open.filter((task) => task.status === "in_progress").length,
    inReview: open.filter((task) => isTaskInReview(task.status)).length,
    overdue: open.filter((task) => isTaskOverdue(task, today)).length,
  };
}

export function countDueToday(tasks: DashboardTaskSummary[], today: string): number {
  return tasks.filter((task) => isOpenTask(task) && task.due_date === today).length;
}

export function countDueThisWeek(tasks: DashboardTaskSummary[], today: string): number {
  const weekEnd = getWeekEnd(today);
  return tasks.filter((task) => isOpenTask(task) && task.due_date !== null && task.due_date >= today && task.due_date <= weekEnd).length;
}

export function countUpcomingSevenDays(tasks: DashboardTaskSummary[], today: string): number {
  const endDate = getDateDaysFrom(today, 7);
  return tasks.filter((task) => isOpenTask(task) && task.due_date !== null && task.due_date > today && task.due_date <= endDate).length;
}

type EmployeeAttentionTask = Pick<DashboardTask, "due_date" | "title" | "created_at"> & { status: string; priority: string };

export function isEmployeeTaskNeedsAttention(task: EmployeeAttentionTask, today: string): boolean {
  if (isTaskFinished(task.status)) return false;
  return isTaskOverdue(task, today)
    || task.due_date === today
    || (task.due_date !== null && task.due_date > today && task.due_date <= getDateDaysFrom(today, 7))
    || task.priority === "urgent"
    || task.priority === "high"
    || task.status === "in_progress"
    || isTaskInReview(task.status);
}

function attentionRank(task: DashboardTaskSummary, today: string): number {
  if (isTaskOverdue(task, today)) return 0;
  if (task.due_date === today) return 1;
  if (task.priority === "urgent") return 2;
  if (task.priority === "high") return 3;
  return 4;
}

export function sortEmployeeTasks<T extends DashboardTaskSummary>(tasks: T[], today: string): T[] {
  return [...tasks].sort((left, right) => attentionRank(left, today) - attentionRank(right, today)
    || (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31")
    || left.created_at.localeCompare(right.created_at));
}

function needsAttentionRank(task: EmployeeAttentionTask, today: string): number {
  if (isTaskOverdue(task, today)) return 0;
  if (task.due_date === today) return 1;
  if (task.priority === "urgent") return 2;
  if (task.priority === "high") return 3;
  if (task.status === "in_progress" || isTaskInReview(task.status)) return 4;
  return 5;
}

export function getEmployeeTasksNeedingAttention<T extends EmployeeAttentionTask>(tasks: T[], today: string): T[] {
  return tasks.filter((task) => isEmployeeTaskNeedsAttention(task, today)).sort((left, right) =>
    needsAttentionRank(left, today) - needsAttentionRank(right, today)
    || (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31")
    || left.title.localeCompare(right.title)
    || left.created_at.localeCompare(right.created_at));
}

export type EmployeeAttentionSummaryItem =
  | { kind: "overdueTasks" | "urgentTasks"; count: number }
  | { kind: "overdueAssignments" | "urgentAssignments"; count: number };

export function selectEmployeeAttentionSummary(tasks: DashboardTaskSummary[], assignments: DashboardOfficeAssignment[], today: string): EmployeeAttentionSummaryItem[] {
  const openTasks = tasks.filter(isOpenTask);
  const overdueTasks = openTasks.filter((task) => isTaskOverdue(task, today));
  const urgentTasks = openTasks.filter((task) => !isTaskOverdue(task, today) && (task.priority === "urgent" || task.priority === "high"));
  const overdueAssignments = assignments.filter((item) => isOfficeAssignmentOverdue(item.deadline, item.status, today));
  const urgentAssignments = assignments.filter((item) => !isOfficeAssignmentOverdue(item.deadline, item.status, today) && (item.priority === "urgent" || item.priority === "high"));
  return [
    { kind: "overdueTasks" as const, count: overdueTasks.length },
    { kind: "urgentTasks" as const, count: urgentTasks.length },
    { kind: "overdueAssignments" as const, count: overdueAssignments.length },
    { kind: "urgentAssignments" as const, count: urgentAssignments.length },
  ].filter((item) => item.count > 0);
}

export type AttentionProject = DashboardProject & { openTaskCount: number; overdueCount: number; urgentCount: number; deadlineDaysAway: number | null; progressPercent: number | null };

export function getProjectsRequiringAttention(projects: DashboardProject[], tasks: DashboardTaskSummary[], today: string): AttentionProject[] {
  const byProject = new Map(projects.map((project) => [project.id, project]));
  const summaries = new Map<string, AttentionProject>();
  for (const project of projects) {
    const deadlineDaysAway = project.due_date && project.due_date >= today && project.due_date <= getDateDaysFrom(today, 7)
      ? Math.round((new Date(`${project.due_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
      : null;
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const progress = calculateProjectProgress(projectTasks, today, project.stageProgressMethods);
    summaries.set(project.id, { ...project, openTaskCount: 0, overdueCount: 0, urgentCount: 0, deadlineDaysAway, progressPercent: progress.progressPercent });
  }
  for (const task of tasks) {
    const summary = summaries.get(task.project_id);
    if (!summary || !byProject.has(task.project_id) || !isOpenTask(task)) continue;
    summary.openTaskCount += 1;
    if (isTaskOverdue(task, today)) summary.overdueCount += 1;
    if (task.priority === "urgent" || task.priority === "high") summary.urgentCount += 1;
  }
  return [...summaries.values()]
    .filter((project) => project.overdueCount > 0 || project.deadlineDaysAway !== null || project.urgentCount > 0)
    .sort((left, right) => Number(right.overdueCount > 0) - Number(left.overdueCount > 0)
      || (left.deadlineDaysAway ?? Number.MAX_SAFE_INTEGER) - (right.deadlineDaysAway ?? Number.MAX_SAFE_INTEGER)
      || right.urgentCount - left.urgentCount || left.name.localeCompare(right.name));
}

export function isTaskInWorkloadCategory(task: DashboardTaskSummary, category: WorkloadCategory, today: string): boolean {
  if (!isOpenTask(task)) return false;
  if (category === "review") return isTaskInReview(task.status);
  if (category === "urgent") return task.priority === "urgent";
  if (category === "overdue") return isTaskOverdue(task, today);
  return task.status === category;
}

export type CurrentStatusAge = { unit: "underHour" } | { unit: "hours" | "days"; value: number };

export function getCurrentStatusAge(enteredAt: string | null, asOf: string): CurrentStatusAge | null {
  if (!enteredAt) return null;
  const elapsedMinutes = Math.floor((Date.parse(asOf) - Date.parse(enteredAt)) / 60_000);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) return null;
  if (elapsedMinutes < 60) return { unit: "underHour" };
  if (elapsedMinutes < 1_440) return { unit: "hours", value: Math.floor(elapsedMinutes / 60) };
  return { unit: "days", value: Math.floor(elapsedMinutes / 1_440) };
}

export type CurrentStatusDuration = { days: number; hours: number };

export function getCurrentStatusDuration(enteredAt: string | null, asOf: string): CurrentStatusDuration | null {
  if (!enteredAt) return null;
  const elapsedHours = Math.floor((Date.parse(asOf) - Date.parse(enteredAt)) / 3_600_000);
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) return null;
  return { days: Math.floor(elapsedHours / 24), hours: elapsedHours % 24 };
}

export function getTeamWorkload(members: DashboardMember[], tasks: DashboardWorkloadTask[], today: string) {
  return members.map((member) => {
    const assigned = tasks.filter((task) => task.assignee_id === member.id);
    const active = assigned.filter(isOpenTask);
    const inProgress = active.filter((task) => task.status === "in_progress");
    const recentFocus = inProgress
      .filter((task) => task.currentStatusEnteredAt !== null)
      .sort((left, right) => (right.currentStatusEnteredAt ?? "").localeCompare(left.currentStatusEnteredAt ?? ""))[0] ?? null;
    return {
      ...member,
      tasks: sortEmployeeTasks(active, today),
      recentFocus,
      additionalInProgressCount: recentFocus ? inProgress.length - 1 : 0,
      openTaskCount: active.length,
      workloadAreaM2: active.reduce((total, task) => total + task.workloadAreaM2, 0),
      todoCount: active.filter((task) => task.status === "todo").length,
      inProgressCount: inProgress.length,
      reviewCount: active.filter((task) => isTaskInReview(task.status)).length,
      urgentCount: active.filter((task) => task.priority === "urgent").length,
      overdueCount: active.filter((task) => isTaskOverdue(task, today)).length,
    };
  }).sort((left, right) => right.overdueCount - left.overdueCount || right.openTaskCount - left.openTaskCount || left.full_name.localeCompare(right.full_name));
}

export type TeamWorkloadMember = ReturnType<typeof getTeamWorkload>[number];

export type AdminUpcomingItem = {
  key: string;
  kind: "task" | "project" | "finance" | "crm" | "assignment" | "equipment";
  date: string;
  title: string;
  href: string;
  context?: string;
};

export function selectAdminUpcoming(items: AdminUpcomingItem[], today: string, limit = 8): AdminUpcomingItem[] {
  return [...new Map(items.filter((item) => item.date.slice(0, 10) >= today).map((item) => [item.key, item])).values()]
    .sort((left, right) => left.date.localeCompare(right.date) || left.key.localeCompare(right.key))
    .slice(0, limit);
}

export type DashboardOfficeAssignment = {
  id: string;
  title: string;
  deadline: string | null;
  priority: OfficeAssignmentPriority;
  status: OfficeAssignmentStatus;
};

export type AdminMyWorkItem = { kind: "task"; task: DashboardTaskSummary } | { kind: "assignment"; assignment: DashboardOfficeAssignment };

export function selectAdminMyWork(tasks: DashboardTaskSummary[], assignments: DashboardOfficeAssignment[], today: string, limit = 5): AdminMyWorkItem[] {
  const taskOrder = new Map(sortEmployeeTasks(tasks, today).map((task, index) => [task.id, index]));
  return [
    ...tasks.map((task): AdminMyWorkItem => ({ kind: "task", task })),
    ...assignments.map((assignment): AdminMyWorkItem => ({ kind: "assignment", assignment })),
  ].sort((left, right) => {
    const leftDate = left.kind === "task" ? left.task.due_date : left.assignment.deadline;
    const rightDate = right.kind === "task" ? right.task.due_date : right.assignment.deadline;
    const leftOverdue = left.kind === "task" ? isTaskOverdue(left.task, today) : isOfficeAssignmentOverdue(leftDate, left.assignment.status, today);
    const rightOverdue = right.kind === "task" ? isTaskOverdue(right.task, today) : isOfficeAssignmentOverdue(rightDate, right.assignment.status, today);
    const leftPriority = left.kind === "task" ? left.task.priority : left.assignment.priority;
    const rightPriority = right.kind === "task" ? right.task.priority : right.assignment.priority;
    const priorityRank = (priority: string) => priority === "urgent" ? 2 : priority === "high" ? 1 : 0;
    const leftCurrent = left.kind === "task" ? left.task.status === "in_progress" : left.assignment.status === "in_progress";
    const rightCurrent = right.kind === "task" ? right.task.status === "in_progress" : right.assignment.status === "in_progress";
    return Number(rightOverdue) - Number(leftOverdue)
      || priorityRank(rightPriority) - priorityRank(leftPriority)
      || Number(rightCurrent) - Number(leftCurrent)
      || (leftDate ?? "9999-12-31").localeCompare(rightDate ?? "9999-12-31")
      || (left.kind === "task" && right.kind === "task" ? (taskOrder.get(left.task.id) ?? 0) - (taskOrder.get(right.task.id) ?? 0) : 0)
      || `${left.kind}:${left.kind === "task" ? left.task.id : left.assignment.id}`.localeCompare(`${right.kind}:${right.kind === "task" ? right.task.id : right.assignment.id}`);
  }).slice(0, limit);
}
