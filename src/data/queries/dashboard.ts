import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getCurrentUserProfile } from "@/data/queries";
import { createClient } from "@/lib/supabase/server";
import { countDueThisWeek, countDueToday, countUpcomingSevenDays, getEmployeeTasksNeedingAttention, getProjectsRequiringAttention, getTeamWorkload, getTodayDate, isDashboardTask, isOpenTask, sortEmployeeTasks, type DashboardMember, type DashboardProject, type DashboardTask } from "@/lib/dashboard";
import { calculateProjectProgress, DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { isTaskInReview, isTaskOverdue } from "@/lib/tasks";
import type { MyTask } from "@/types/tasks";

type DashboardTaskRow = DashboardTask;
type DashboardProjectRow = DashboardProject;

export type DashboardDeadline = { id: string; kind: "task" | "project"; title: string; dueDate: string; project?: { id: string; name: string } };
type DashboardTaskForDrawer = MyTask;

export type AdminDashboard = { kind: "admin"; profile: { id: string; full_name: string }; metrics: { activeProjects: number; openTasks: number; overdueTasks: number; dueThisWeek: number }; attentionProjects: ReturnType<typeof getProjectsRequiringAttention>; deadlines: DashboardDeadline[]; workload: ReturnType<typeof getTeamWorkload>; myTasks: DashboardTaskForDrawer[] };
export type EmployeeDashboard = { kind: "employee"; profile: { id: string; full_name: string }; metrics: { overdue: number; dueToday: number; inProgress: number; upcoming: number }; needsAttention: DashboardTaskForDrawer[]; projects: Array<DashboardProject & { openTaskCount: number; inProgressCount: number; nearestDueDate: string | null; progressPercent: number | null }>; hasMoreProjects: boolean; deadlines: DashboardDeadline[] };
export type DashboardData = AdminDashboard | EmployeeDashboard;

function toDrawerTask(task: DashboardTask): DashboardTaskForDrawer {
  return task;
}

function makeDeadlines(tasks: DashboardTask[], projects: DashboardProject[], today: string): DashboardDeadline[] {
  const endDate = new Date(today + "T12:00:00"); endDate.setDate(endDate.getDate() + 14);
  const limit = endDate.toISOString().slice(0, 10);
  return [
    ...tasks.filter((task) => isOpenTask(task) && task.due_date && task.due_date >= today && task.due_date <= limit).map((task) => ({ id: task.id, kind: "task" as const, title: task.title, dueDate: task.due_date!, project: task.project })),
    ...projects.filter((project) => project.due_date && project.due_date >= today && project.due_date <= limit).map((project) => ({ id: project.id, kind: "project" as const, title: project.name, dueDate: project.due_date! })),
  ].sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title)).slice(0, 10);
}

export async function getDashboard(): Promise<DashboardData | null> {
  const [profile, membership] = await Promise.all([getCurrentUserProfile(), getActiveStudioMembership()]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) return null;
  if (membership.system_role !== "admin" && membership.system_role !== "employee") throw new Error("Active studio membership has an unsupported role.");
  const supabase = await createClient();
  const projectQuery = supabase.from("projects").select("id, name, project_code, client_name, due_date, status").eq("studio_id", membership.studio_id).is("archived_at", null).in("status", ["planned", "active", "paused"]);
  const taskQuery = supabase.from("tasks").select("id, project_id, stage, title, description, status, priority, assignee_id, due_date, completed_at, completed_area_m2, production_completion, progress_weight, created_at, created_by, checklist_items:task_checklist_items(id, task_id, title, is_completed, weight, position, created_at, updated_at), assignee:profiles!tasks_assignee_id_fkey(id, full_name, job_title, avatar_url), creator:profiles!tasks_created_by_fkey(id, full_name, job_title, avatar_url), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at)").eq("project.studio_id", membership.studio_id).is("project.archived_at", null).in("project.status", ["planned", "active", "paused"]);
  const [projectsResult, tasksResult, membersResult] = await Promise.all([
    projectQuery.overrideTypes<DashboardProjectRow[], { merge: false }>(),
    taskQuery.overrideTypes<DashboardTaskRow[], { merge: false }>(),
    membership.system_role === "admin" ? supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<Array<{ profile: DashboardMember }>, { merge: false }>() : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectsResult.error || tasksResult.error || membersResult.error || !projectsResult.data || !tasksResult.data || !membersResult.data) throw new Error("Unable to load Dashboard data.", { cause: projectsResult.error ?? tasksResult.error ?? membersResult.error });
  const today = getTodayDate();
  const stageConfigurationsResult = await supabase.from("project_task_stage_columns").select("project_id, stage, progress_method").in("project_id", projectsResult.data.map((project) => project.id));
  if (stageConfigurationsResult.error || !stageConfigurationsResult.data) throw new Error("Unable to load Dashboard stage progress methods.", { cause: stageConfigurationsResult.error });
  const methodsByProject = new Map<string, ProjectStageProgressMethods>();
  for (const project of projectsResult.data) methodsByProject.set(project.id, { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS });
  for (const configuration of stageConfigurationsResult.data) {
    if (!PROJECT_PROGRESS_STAGES.includes(configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]) || !isStageProgressMethod(configuration.progress_method)) continue;
    const methods = methodsByProject.get(configuration.project_id);
    if (methods) methods[configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]] = configuration.progress_method;
  }
  const projects = projectsResult.data.map((project) => ({ ...project, stageProgressMethods: methodsByProject.get(project.id) ?? { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } }));
  if (!tasksResult.data.every(isDashboardTask)) throw new Error("Dashboard received unsupported task data.");
  const tasks = tasksResult.data;
  if (membership.system_role === "admin") {
    const myTasks = sortEmployeeTasks(tasks.filter((task) => task.assignee_id === profile.id && isOpenTask(task)), today).slice(0, 5).map(toDrawerTask);
    return { kind: "admin", profile, metrics: { activeProjects: projects.length, openTasks: tasks.filter(isOpenTask).length, overdueTasks: tasks.filter((task) => isTaskOverdue(task, today)).length, dueThisWeek: countDueThisWeek(tasks, today) }, attentionProjects: getProjectsRequiringAttention(projects, tasks, today).slice(0, 6), deadlines: makeDeadlines(tasks, projects, today), workload: getTeamWorkload(membersResult.data.map((member) => member.profile), tasks, today), myTasks };
  }
  const personalTasks = tasks.filter((task) => task.assignee_id === profile.id);
  const taskByProject = new Map<string, DashboardTask[]>();
  for (const task of personalTasks) taskByProject.set(task.project_id, [...(taskByProject.get(task.project_id) ?? []), task]);
  return { kind: "employee", profile, metrics: { overdue: personalTasks.filter((task) => isTaskOverdue(task, today)).length, dueToday: countDueToday(personalTasks, today), inProgress: personalTasks.filter((task) => task.status === "in_progress" || isTaskInReview(task.status)).length, upcoming: countUpcomingSevenDays(personalTasks, today) }, needsAttention: getEmployeeTasksNeedingAttention(personalTasks, today).slice(0, 8).map(toDrawerTask), projects: projects.map((project) => { const projectTasks = taskByProject.get(project.id) ?? []; const allProjectTasks = tasks.filter((task) => task.project_id === project.id); const dueDates = projectTasks.filter(isOpenTask).flatMap((task) => task.due_date ? [task.due_date] : []); const progress = calculateProjectProgress(allProjectTasks, today, project.stageProgressMethods); return { ...project, openTaskCount: projectTasks.filter(isOpenTask).length, inProgressCount: projectTasks.filter((task) => task.status === "in_progress" || isTaskInReview(task.status)).length, nearestDueDate: dueDates.sort()[0] ?? null, progressPercent: progress.progressPercent }; }).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 6), hasMoreProjects: projects.length > 6, deadlines: makeDeadlines(personalTasks, projects, today) };
}
