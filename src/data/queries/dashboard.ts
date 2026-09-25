import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getCurrentUserProfile, getMyDashboardProductivity } from "@/data/queries";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TASK_PROGRESS_SELECT } from "@/data/queries/project-progress";
import { getProjectsRequiringAttention, getTeamWorkload, isDashboardTask, isDashboardTaskProjectEligible, isOpenTask, selectAdminTaskMetrics, selectEmployeeTaskMetrics, selectEmployeeAttentionSummary, sortEmployeeTasks, getEmployeeTasksNeedingAttention, type DashboardMember, type DashboardProject } from "@/lib/dashboard";
import { calculateProjectProgress, DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { isTaskInReview, isTaskOverdue } from "@/lib/tasks";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import { getKyivMonthBounds, getProductivityWorkloadAreaByTask } from "@/lib/productivity";
import { getKyivDateOnly } from "@/lib/validation/project";
import { isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";
import { OPERATIONAL_PROJECT_STATUSES } from "@/lib/project-lifecycle";
import type { DashboardTaskSummary, DashboardWorkloadTask } from "@/types/tasks";

type DashboardTaskRow = Omit<DashboardTaskSummary, "collaborators"> & {
  collaborators: Array<{ user_id: string; profile: { id: string } | null }>;
  productivity_area_m2: number | null;
};
type DashboardProjectRow = DashboardProject & { total_area_m2: number | null; include_in_productivity: boolean };

export type DashboardDeadline = { id: string; kind: "task" | "project"; title: string; dueDate: string; project?: { id: string; name: string } };

export type AdminDashboard = { kind: "admin"; profile: { id: string; full_name: string }; asOf: string; today: string; metrics: { activeProjects: number; activeTasks: number; overdueTasks: number }; attentionProjects: ReturnType<typeof getProjectsRequiringAttention>; deadlines: DashboardDeadline[]; workload: ReturnType<typeof getTeamWorkload>; myTasks: DashboardTaskSummary[] };
export type EmployeeDashboard = { kind: "employee"; profile: { id: string; full_name: string }; today: string; metrics: { overdue: number; inProgress: number; inReview: number; completedThisMonth: number; productivity: NonNullable<Awaited<ReturnType<typeof getMyDashboardProductivity>>>; vacationBalance: number | null; nextAbsence: string | null }; myTasks: DashboardTaskSummary[]; myAssignments: import("@/lib/dashboard").DashboardOfficeAssignment[]; needsAttention: DashboardTaskSummary[]; attention: ReturnType<typeof selectEmployeeAttentionSummary>; projects: Array<DashboardProject & { openTaskCount: number; inProgressCount: number; nearestDueDate: string | null; progressPercent: number | null }>; deadlines: DashboardDeadline[] };
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
  const projectQuery = supabase.from("projects").select("id, name, project_code, client_name, due_date, status, total_area_m2, include_in_productivity").eq("studio_id", membership.studio_id).is("archived_at", null).in("status", OPERATIONAL_PROJECT_STATUSES);
  const taskQuery = supabase.from("tasks").select(`${PROJECT_TASK_PROGRESS_SELECT}, productivity_area_m2, title, created_at, collaborators:task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey(id)), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at)`).eq("project.studio_id", membership.studio_id).is("project.archived_at", null).neq("project.status", "paused").neq("project.status", "archived");
  const [projectsResult, tasksResult, membersResult] = await Promise.all([
    projectQuery.overrideTypes<DashboardProjectRow[], { merge: false }>(),
    taskQuery.overrideTypes<DashboardTaskRow[], { merge: false }>(),
    membership.system_role === "admin" ? supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, is_active)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<Array<{ profile: DashboardMember & { is_active: boolean } }>, { merge: false }>() : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectsResult.error || tasksResult.error || membersResult.error || !projectsResult.data || !tasksResult.data || !membersResult.data) throw new Error("Unable to load Dashboard data.", { cause: projectsResult.error ?? tasksResult.error ?? membersResult.error });
  const now = new Date();
  const asOf = now.toISOString();
  const today = getKyivDateOnly(now);
  const [stageConfigurationsResult, currentStatusPeriodsResult, budgetsResult, projectMembersResult] = await Promise.all([
    supabase.from("project_task_stage_columns").select("project_id, stage, progress_method").in("project_id", projectsResult.data.map((project) => project.id)),
    membership.system_role === "admin"
      ? supabase.from("task_status_periods").select("task_id, status, entered_at").eq("studio_id", membership.studio_id).is("exited_at", null)
      : Promise.resolve({ data: [], error: null }),
    membership.system_role === "admin"
      ? supabase.from("project_stage_productivity_budgets").select("project_id, stage, productivity_budget_m2, allocated_productivity_m2").in("project_id", projectsResult.data.map((project) => project.id))
      : Promise.resolve({ data: [], error: null }),
    membership.system_role === "admin"
      ? supabase.from("project_members").select("project_id, user_id").in("project_id", projectsResult.data.map((project) => project.id)).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stageConfigurationsResult.error || !stageConfigurationsResult.data || currentStatusPeriodsResult.error || !currentStatusPeriodsResult.data || budgetsResult.error || !budgetsResult.data || projectMembersResult.error || !projectMembersResult.data) throw new Error("Unable to load Dashboard supporting data.", { cause: stageConfigurationsResult.error ?? currentStatusPeriodsResult.error ?? budgetsResult.error ?? projectMembersResult.error });
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
    const activeMemberIds = new Set(membersResult.data.filter((member) => member.profile.is_active).map((member) => member.profile.id));
    const activeAssignments = new Set(projectMembersResult.data.filter((member) => activeMemberIds.has(member.user_id)).map((member) => `${member.project_id}:${member.user_id}`));
    const workloadAreaByTask = getProductivityWorkloadAreaByTask(tasks, projectsResult.data, budgetsResult.data, activeAssignments);
    const workloadTasks: DashboardWorkloadTask[] = tasks.map((task) => {
      const period = currentPeriodByTask.get(task.id);
      return { ...task, workloadAreaM2: workloadAreaByTask.get(task.id) ?? 0, currentStatusEnteredAt: period?.status === task.status ? period.entered_at : null };
    });
    const openTasks = tasks.filter(isOpenTask);
    const myTasks = sortEmployeeTasks(openTasks.filter((task) => task.assignee_id === profile.id || task.collaborators.some((collaborator) => collaborator.id === profile.id)), today);
    return {
      kind: "admin", profile, asOf, today,
      metrics: { activeProjects: projects.length, ...selectAdminTaskMetrics(openTasks, today) },
      attentionProjects: getProjectsRequiringAttention(projects, tasks, today).slice(0, 6),
      deadlines: makeDeadlines(tasks, projects, today, 30, Number.POSITIVE_INFINITY),
      workload: getTeamWorkload(membersResult.data.map((member) => member.profile), workloadTasks, today),
      myTasks,
    };
  }
  const personalTasks = tasks.filter((task) => task.assignee_id === profile.id || task.collaborators.some((collaborator) => collaborator.id === profile.id));
  const month = getKyivMonthBounds(now);
  const completedScope = () => supabase.from("tasks").select("id, project:projects!tasks_project_id_fkey!inner(studio_id)", { count: "exact", head: true })
    .eq("project.studio_id", membership.studio_id).eq("status", "completed")
    .gte("completed_at", month.start).lt("completed_at", month.end);
  const completedWithCollaboration = () => supabase.from("tasks")
    .select("id, project:projects!tasks_project_id_fkey!inner(studio_id), collaborators:task_collaborators!inner(user_id)", { count: "exact", head: true })
    .eq("project.studio_id", membership.studio_id).eq("collaborators.user_id", profile.id).eq("status", "completed")
    .gte("completed_at", month.start).lt("completed_at", month.end);

  const [productivity, assignmentsResult, balanceResult, absencesResult, completedAssigned, completedCollaborating, completedBoth] = await Promise.all([
    getMyDashboardProductivity(),
    supabase.from("office_assignments").select("id,title,deadline,priority,status").eq("studio_id", membership.studio_id).eq("responsible_id", profile.id).overrideTypes<import("@/lib/dashboard").DashboardOfficeAssignment[], { merge: false }>(),
    supabase.rpc("project_vacation_request", { p_studio_id: membership.studio_id, p_user_id: profile.id, p_start: today, p_end: today }),
    supabase.from("time_off_requests").select("start_date").eq("studio_id", membership.studio_id).eq("user_id", profile.id).eq("status", "approved").is("cancelled_at", null).gte("end_date", today).order("start_date").limit(1),
    completedScope().eq("assignee_id", profile.id),
    completedWithCollaboration(),
    completedWithCollaboration().eq("assignee_id", profile.id),
  ]);
  if (!productivity || assignmentsResult.error || balanceResult.error || absencesResult.error || completedAssigned.error || completedCollaborating.error || completedBoth.error) throw new Error("Unable to load employee Dashboard context.", { cause: assignmentsResult.error ?? balanceResult.error ?? absencesResult.error ?? completedAssigned.error ?? completedCollaborating.error ?? completedBoth.error });
  const completedThisMonth = (completedAssigned.count ?? 0) + (completedCollaborating.count ?? 0) - (completedBoth.count ?? 0);
  const myAssignments = (assignmentsResult.data ?? []).filter((assignment) => !isTerminalOfficeAssignmentStatus(assignment.status));
  const openPersonalTasks = personalTasks.filter(isOpenTask);

  const taskByProject = new Map<string, DashboardTaskSummary[]>();
  for (const task of personalTasks) taskByProject.set(task.project_id, [...(taskByProject.get(task.project_id) ?? []), task]);
  return { kind: "employee", profile, today, metrics: {
    ...selectEmployeeTaskMetrics(personalTasks, today), completedThisMonth,
    productivity, vacationBalance: balanceResult.data?.[0]?.available ?? null,
    nextAbsence: absencesResult.data?.[0]?.start_date ?? null,
  }, myTasks: sortEmployeeTasks(openPersonalTasks, today), myAssignments,
    needsAttention: getEmployeeTasksNeedingAttention(openPersonalTasks, today).slice(0, 8),
    attention: selectEmployeeAttentionSummary(openPersonalTasks, myAssignments, today),
    projects: projects.filter((project) => taskByProject.has(project.id)).map((project) => { const projectTasks = taskByProject.get(project.id) ?? []; const allProjectTasks = tasks.filter((task) => task.project_id === project.id); const dueDates = projectTasks.filter(isOpenTask).flatMap((task) => task.due_date ? [task.due_date] : []); const progress = calculateProjectProgress(allProjectTasks, today, project.stageProgressMethods); return { ...project, openTaskCount: projectTasks.filter(isOpenTask).length, inProgressCount: projectTasks.filter((task) => task.status === "in_progress" || isTaskInReview(task.status)).length, nearestDueDate: dueDates.sort()[0] ?? null, progressPercent: progress.progressPercent }; }).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 6), deadlines: makeDeadlines(personalTasks, projects.filter((project) => taskByProject.has(project.id)), today) };
}
