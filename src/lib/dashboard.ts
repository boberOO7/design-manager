import { isTaskFinished, isTaskInReview, isTaskOverdue, isTaskPriority, isTaskStatus } from "./tasks";
import type { MyTask } from "../types/tasks";
import { canWorkOnTaskInProject, isOperationalProjectStatus, type ProjectLifecycleStatus } from "./project-lifecycle";
import { calculateProjectProgress, type ProjectStageProgressMethods } from "./project-progress";
import { isTaskStage } from "./task-stages";

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

export function isDashboardTask(task: { project: DashboardTask["project"]; priority: string; stage: string; status: string }): task is DashboardTask {
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

export function countDueToday(tasks: DashboardTask[], today: string): number {
  return tasks.filter((task) => isOpenTask(task) && task.due_date === today).length;
}

export function countDueThisWeek(tasks: DashboardTask[], today: string): number {
  const weekEnd = getWeekEnd(today);
  return tasks.filter((task) => isOpenTask(task) && task.due_date !== null && task.due_date >= today && task.due_date <= weekEnd).length;
}

export function countUpcomingSevenDays(tasks: DashboardTask[], today: string): number {
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

function attentionRank(task: DashboardTask, today: string): number {
  if (isTaskOverdue(task, today)) return 0;
  if (task.due_date === today) return 1;
  if (task.priority === "urgent") return 2;
  if (task.priority === "high") return 3;
  return 4;
}

export function sortEmployeeTasks(tasks: DashboardTask[], today: string): DashboardTask[] {
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

export type AttentionProject = DashboardProject & { openTaskCount: number; overdueCount: number; urgentCount: number; deadlineDaysAway: number | null; progressPercent: number | null };

export function getProjectsRequiringAttention(projects: DashboardProject[], tasks: DashboardTask[], today: string): AttentionProject[] {
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

export function getTeamWorkload(members: DashboardMember[], tasks: DashboardTask[], today: string) {
  return members.map((member) => {
    const assigned = tasks.filter((task) => task.assignee_id === member.id);
    const active = assigned.filter(isOpenTask);
    return {
      ...member,
      openTaskCount: active.length,
      todoCount: active.filter((task) => task.status === "todo").length,
      inProgressCount: active.filter((task) => task.status === "in_progress").length,
      reviewCount: active.filter((task) => isTaskInReview(task.status)).length,
      urgentCount: active.filter((task) => task.priority === "urgent").length,
      overdueCount: active.filter((task) => isTaskOverdue(task, today)).length,
    };
  }).sort((left, right) => right.overdueCount - left.overdueCount || right.openTaskCount - left.openTaskCount || left.full_name.localeCompare(right.full_name));
}
