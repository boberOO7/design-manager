import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getCurrentUserProfile } from "@/data/queries";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TASK_PROGRESS_SELECT } from "@/data/queries/project-progress";
import { countDueThisWeek, countDueToday, countUpcomingSevenDays, getEmployeeTasksNeedingAttention, getProjectsRequiringAttention, getTeamWorkload, getTodayDate, isDashboardTask, isDashboardTaskProjectEligible, isOpenTask, sortEmployeeTasks, type DashboardMember, type DashboardProject } from "@/lib/dashboard";
import { calculateProjectProgress, DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { isTaskInReview, isTaskOverdue } from "@/lib/tasks";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import { OPERATIONAL_PROJECT_STATUSES } from "@/lib/project-lifecycle";
import type { DashboardTaskSummary, DashboardWorkloadTask } from "@/types/tasks";

type DashboardTaskRow = Omit<DashboardTaskSummary, "collaborators"> & {
  collaborators: Array<{ user_id: string; profile: { id: string } | null }>;
};
type DashboardProjectRow = DashboardProject;

export type DashboardDeadline = { id: string; kind: "task" | "project"; title: string; dueDate: string; project?: { id: string; name: string } };

export type AdminDashboard = { kind: "admin"; profile: { id: string; full_name: string }; asOf: string; today: string; metrics: { activeProjects: number; openTasks: number; overdueTasks: number; dueThisWeek: number }; attentionProjects: ReturnType<typeof getProjectsRequiringAttention>; deadlines: DashboardDeadline[]; workload: ReturnType<typeof getTeamWorkload>; myTasks: DashboardTaskSummary[] };
export type EmployeeDashboard = { kind: "employee"; profile: { id: string; full_name: string }; metrics: { overdue: number; dueToday: number; inProgress: number; upcoming: number }; needsAttention: DashboardTaskSummary[]; projects: Array<DashboardProject & { openTaskCount: number; inProgressCount: number; nearestDueDate: string | null; progressPercent: number | null }>; hasMoreProjects: boolean; deadlines: DashboardDeadline[] };
export type DashboardData = AdminDashboard | EmployeeDashboard;

function makeDeadlines(tasks: DashboardTaskSummary[], projects: DashboardProject[], today: string, days = 14, limitCount = 10): DashboardDeadline[] {
  const endDate = new Date(today + "T12:00:00"); endDate.setDate(endDate.getDate() + days);
  const limit = endDate.toISOString().slice(0, 10);
  return [
    ...tasks.filter((task) => isOpenTask(task) && task.due_date && task.due_date >= today && task.due_date <= limit).map((task) => ({ id: task.id, kind: "task" as const, title: task.title, dueDate: task.due_date!, project: task.project })),
    ...projects.filter((project) => project.due_date && project.due_date >= today && project.due_date <= limit).map((project) => ({ id: project.id, kind: "project" as const, title: project.name, dueDate: project.due_date! })),
  ].sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title)).slice(0, limitCount);
}

export async function getDashboard(): Promise<DashboardData | null> {
  const [profile, membership] = await Promise.all([getCurrentUserProfile(), getActiveStudioMembership()]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) return null;
  if (membership.system_role !== "admin" && membership.system_role !== "employee") throw new Error("Active studio membership has an unsupported role.");
  const supabase = await createClient();
  const projectQuery = supabase.from("projects").select("id, name, project_code, client_name, due_date, status").eq("studio_id", membership.studio_id).is("archived_at", null).in("status", OPERATIONAL_PROJECT_STATUSES);
  const taskQuery = supabase.from("tasks").select(`${PROJECT_TASK_PROGRESS_SELECT}, title, created_at, collaborators:task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey(id)), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at)`).eq("project.studio_id", membership.studio_id).is("project.archived_at", null).neq("project.status", "paused").neq("project.status", "archived");
  const [projectsResult, tasksResult, membersResult] = await Promise.all([
    projectQuery.overrideTypes<DashboardProjectRow[], { merge: false }>(),
    taskQuery.overrideTypes<DashboardTaskRow[], { merge: false }>(),
    membership.system_role === "admin" ? supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<Array<{ profile: DashboardMember }>, { merge: false }>() : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectsResult.error || tasksResult.error || membersResult.error || !projectsResult.data || !tasksResult.data || !membersResult.data) throw new Error("Unable to load Dashboard data.", { cause: projectsResult.error ?? tasksResult.error ?? membersResult.error });
  const asOf = new Date().toISOString();
  const today = getTodayDate(new Date(asOf));
  const [stageConfigurationsResult, currentStatusPeriodsResult] = await Promise.all([
    supabase.from("project_task_stage_columns").select("project_id, stage, progress_method").in("project_id", projectsResult.data.map((project) => project.id)),
    membership.system_role === "admin"
      ? supabase.from("task_status_periods").select("task_id, status, entered_at").eq("studio_id", membership.studio_id).is("exited_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stageConfigurationsResult.error || !stageConfigurationsResult.data || currentStatusPeriodsResult.error || !currentStatusPeriodsResult.data) throw new Error("Unable to load Dashboard supporting data.", { cause: stageConfigurationsResult.error ?? currentStatusPeriodsResult.error });
  const methodsByProject = new Map<string, ProjectStageProgressMethods>();
  for (const project of projectsResult.data) methodsByProject.set(project.id, { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS });
  for (const configuration of stageConfigurationsResult.data) {
    if (!PROJECT_PROGRESS_STAGES.includes(configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]) || !isStageProgressMethod(configuration.progress_method)) continue;
    const methods = methodsByProject.get(configuration.project_id);
    if (methods) methods[configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]] = configuration.progress_method;
  }
  const projects = projectsResult.data.map((project) => ({ ...project, stageProgressMethods: methodsByProject.get(project.id) ?? { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } }));
  const tasks = tasksResult.data.map(({ collaborators, ...task }) => {
    const deadlines = task.deadlines ?? [];
    return { ...task, deadlines, due_date: getActiveTaskDeadline({ status: task.status, deadlines })?.due_date ?? null, collaborators: collaborators.filter((row) => row.profile !== null).map((row) => ({ id: row.user_id })) };
  }).filter(isDashboardTaskProjectEligible);
  if (!tasks.every(isDashboardTask)) throw new Error("Dashboard received unsupported task data.");
  if (membership.system_role === "admin") {
    const currentPeriodByTask = new Map(currentStatusPeriodsResult.data.map((period) => [period.task_id, period]));
    const workloadTasks: DashboardWorkloadTask[] = tasks.map((task) => {
      const period = currentPeriodByTask.get(task.id);
      return { ...task, currentStatusEnteredAt: period?.status === task.status ? period.entered_at : null };
    });
    const openTasks = tasks.filter(isOpenTask);
    const myTasks = sortEmployeeTasks(openTasks.filter((task) => task.assignee_id === profile.id || task.collaborators.some((collaborator) => collaborator.id === profile.id)), today).slice(0, 5);
    return {
      kind: "admin", profile, asOf, today,
      metrics: { activeProjects: projects.length, openTasks: openTasks.length, overdueTasks: openTasks.filter((task) => isTaskOverdue(task, today)).length, dueThisWeek: countDueThisWeek(openTasks, today) },
      attentionProjects: getProjectsRequiringAttention(projects, tasks, today).slice(0, 6),
      deadlines: makeDeadlines(tasks, projects, today, 30, 50),
      workload: getTeamWorkload(membersResult.data.map((member) => member.profile), workloadTasks, today),
      myTasks,
    };
  }
  const personalTasks = tasks.filter((task) => task.assignee_id === profile.id || task.collaborators.some((collaborator) => collaborator.id === profile.id));
  const taskByProject = new Map<string, DashboardTaskSummary[]>();
  for (const task of personalTasks) taskByProject.set(task.project_id, [...(taskByProject.get(task.project_id) ?? []), task]);
  return { kind: "employee", profile, metrics: { overdue: personalTasks.filter((task) => isTaskOverdue(task, today)).length, dueToday: countDueToday(personalTasks, today), inProgress: personalTasks.filter((task) => task.status === "in_progress" || isTaskInReview(task.status)).length, upcoming: countUpcomingSevenDays(personalTasks, today) }, needsAttention: getEmployeeTasksNeedingAttention(personalTasks, today).slice(0, 8), projects: projects.map((project) => { const projectTasks = taskByProject.get(project.id) ?? []; const allProjectTasks = tasks.filter((task) => task.project_id === project.id); const dueDates = projectTasks.filter(isOpenTask).flatMap((task) => task.due_date ? [task.due_date] : []); const progress = calculateProjectProgress(allProjectTasks, today, project.stageProgressMethods); return { ...project, openTaskCount: projectTasks.filter(isOpenTask).length, inProgressCount: projectTasks.filter((task) => task.status === "in_progress" || isTaskInReview(task.status)).length, nearestDueDate: dueDates.sort()[0] ?? null, progressPercent: progress.progressPercent }; }).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 6), hasMoreProjects: projects.length > 6, deadlines: makeDeadlines(personalTasks, projects, today) };
}
