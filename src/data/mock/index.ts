import type {
  DashboardMetrics,
  EmployeeWorkloadSummary,
  LeaderboardEntry,
  Profile,
  Project,
  ProjectAreaProgressEntry,
  ProjectMember,
  ProjectSummary,
  Task,
  TaskSummary,
} from "@/types";

export const studioProfiles: Profile[] = [
  {
    id: "user-admin",
    full_name: "Diana Petrenko",
    email: "diana@studio.com",
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
    job_title: "Studio Director",
    system_role: "admin",
    is_active: true,
    created_at: "2024-01-08T09:00:00.000Z",
    updated_at: "2024-01-08T09:00:00.000Z",
  },
  {
    id: "user-anna",
    full_name: "Anna Shevchenko",
    email: "anna@studio.com",
    avatar_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=120&q=80",
    job_title: "Senior Interior Designer",
    system_role: "employee",
    is_active: true,
    created_at: "2024-01-08T09:30:00.000Z",
    updated_at: "2024-01-08T09:30:00.000Z",
  },
  {
    id: "user-oleksandr",
    full_name: "Oleksandr Malik",
    email: "oleksandr@studio.com",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
    job_title: "Project Designer",
    system_role: "employee",
    is_active: true,
    created_at: "2024-01-08T10:00:00.000Z",
    updated_at: "2024-01-08T10:00:00.000Z",
  },
  {
    id: "user-maria",
    full_name: "Maria Hryc",
    email: "maria@studio.com",
    avatar_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80",
    job_title: "Visualizer",
    system_role: "employee",
    is_active: true,
    created_at: "2024-01-08T10:30:00.000Z",
    updated_at: "2024-01-08T10:30:00.000Z",
  },
];

export const studioProjects: Project[] = [
  {
    id: "project-1",
    studio_id: "studio-1",
    name: "Private House in Kyiv",
    project_code: "PH-204",
    client_name: "Olena Koval",
    description: "Full interior design concept for a family residence.",
    total_area_m2: 450,
    status: "active",
    priority: "high",
    start_date: "2025-02-10",
    due_date: "2026-08-20",
    completed_at: null,
    archived_at: null,
    created_by: "user-admin",
    created_at: "2025-02-10T09:00:00.000Z",
    updated_at: "2026-07-10T09:00:00.000Z",
  },
  {
    id: "project-2",
    studio_id: "studio-1",
    name: "Boutique Office Renewal",
    project_code: "BO-118",
    client_name: "Astra Labs",
    description: "Renovation and zoning plan for a boutique office.",
    total_area_m2: 280,
    status: "active",
    priority: "normal",
    start_date: "2025-04-04",
    due_date: "2026-08-05",
    completed_at: null,
    archived_at: null,
    created_by: "user-admin",
    created_at: "2025-04-04T10:30:00.000Z",
    updated_at: "2026-07-12T09:45:00.000Z",
  },
  {
    id: "project-3",
    studio_id: "studio-1",
    name: "Apartment Refurbishment",
    project_code: "AR-77",
    client_name: "Serhiy Lozinsky",
    description: "Residential refurbishment with custom millwork.",
    total_area_m2: 180,
    status: "completed",
    priority: "low",
    start_date: "2024-09-05",
    due_date: "2025-02-10",
    completed_at: "2025-02-10",
    archived_at: "2025-03-15",
    created_by: "user-admin",
    created_at: "2024-09-05T08:30:00.000Z",
    updated_at: "2025-02-10T12:00:00.000Z",
  },
  {
    id: "project-4",
    studio_id: "studio-1",
    name: "Retail Concept Studio",
    project_code: "RC-33",
    client_name: "Lumen & Co",
    description: "Spatial design for a retail showroom.",
    total_area_m2: 320,
    status: "archived",
    priority: "high",
    start_date: "2024-02-20",
    due_date: "2024-12-14",
    completed_at: "2024-12-14",
    archived_at: "2025-01-10",
    created_by: "user-admin",
    created_at: "2024-02-20T09:20:00.000Z",
    updated_at: "2025-01-10T15:00:00.000Z",
  },
];

export const projectMembers: ProjectMember[] = [
  { id: "pm-1", project_id: "project-1", user_id: "user-anna", project_role: "lead_designer", assigned_area_m2: 300, is_active: true, assigned_at: "2025-02-10", removed_at: null, created_at: "2025-02-10T09:10:00.000Z", updated_at: "2025-02-10T09:10:00.000Z" },
  { id: "pm-2", project_id: "project-1", user_id: "user-oleksandr", project_role: "designer", assigned_area_m2: 150, is_active: true, assigned_at: "2025-02-10", removed_at: null, created_at: "2025-02-10T09:10:00.000Z", updated_at: "2025-02-10T09:10:00.000Z" },
  { id: "pm-3", project_id: "project-2", user_id: "user-anna", project_role: "designer", assigned_area_m2: 160, is_active: true, assigned_at: "2025-05-01", removed_at: null, created_at: "2025-05-01T09:10:00.000Z", updated_at: "2025-05-01T09:10:00.000Z" },
  { id: "pm-4", project_id: "project-2", user_id: "user-maria", project_role: "visualizer", assigned_area_m2: 120, is_active: true, assigned_at: "2025-05-01", removed_at: null, created_at: "2025-05-01T09:10:00.000Z", updated_at: "2025-05-01T09:10:00.000Z" },
  { id: "pm-5", project_id: "project-3", user_id: "user-anna", project_role: "lead_designer", assigned_area_m2: 120, is_active: false, assigned_at: "2024-09-05", removed_at: "2025-03-01", created_at: "2024-09-05T09:10:00.000Z", updated_at: "2025-03-01T09:10:00.000Z" },
  { id: "pm-6", project_id: "project-4", user_id: "user-oleksandr", project_role: "architect", assigned_area_m2: 180, is_active: false, assigned_at: "2024-02-20", removed_at: "2025-01-10", created_at: "2024-02-20T09:10:00.000Z", updated_at: "2025-01-10T09:10:00.000Z" },
];

export const projectAreaProgress: ProjectAreaProgressEntry[] = [
  { id: "prog-1", project_id: "project-1", user_id: "user-anna", area_m2: 80, progress_date: "2026-07-10", note: "Concept development completed", recorded_by: "user-admin", created_at: "2026-07-10T10:00:00.000Z", updated_at: "2026-07-10T10:00:00.000Z" },
  { id: "prog-2", project_id: "project-1", user_id: "user-anna", area_m2: 50, progress_date: "2026-07-18", note: "Material palette refined", recorded_by: "user-admin", created_at: "2026-07-18T10:00:00.000Z", updated_at: "2026-07-18T10:00:00.000Z" },
  { id: "prog-3", project_id: "project-2", user_id: "user-maria", area_m2: 40, progress_date: "2026-06-20", note: "3D visualizations finalized", recorded_by: "user-admin", created_at: "2026-06-20T10:00:00.000Z", updated_at: "2026-06-20T10:00:00.000Z" },
  { id: "prog-4", project_id: "project-2", user_id: "user-anna", area_m2: 35, progress_date: "2026-06-22", note: "Client review update", recorded_by: "user-admin", created_at: "2026-06-22T10:00:00.000Z", updated_at: "2026-06-22T10:00:00.000Z" },
];

export const studioTasks: Task[] = [
  { id: "task-1", project_id: "project-1", title: "Finalize zoning plan", description: "Confirm circulation and daylight studies", status: "in_progress", priority: "high", assignee_id: "user-anna", created_by: "user-admin", start_date: "2026-07-01", due_date: "2026-07-24", completed_at: null, created_at: "2026-06-30T09:00:00.000Z", updated_at: "2026-07-12T09:00:00.000Z" },
  { id: "task-2", project_id: "project-1", title: "Prepare furniture schedule", description: null, status: "todo", priority: "normal", assignee_id: "user-oleksandr", created_by: "user-admin", start_date: "2026-07-05", due_date: "2026-07-26", completed_at: null, created_at: "2026-07-02T09:00:00.000Z", updated_at: "2026-07-02T09:00:00.000Z" },
  { id: "task-3", project_id: "project-2", title: "Review render set", description: "Share updates with client", status: "completed", priority: "high", assignee_id: "user-maria", created_by: "user-admin", start_date: "2026-06-10", due_date: "2026-06-18", completed_at: "2026-06-18", created_at: "2026-06-08T09:00:00.000Z", updated_at: "2026-06-18T14:00:00.000Z" },
  { id: "task-4", project_id: "project-3", title: "Close out final punch list", description: null, status: "completed", priority: "low", assignee_id: "user-anna", created_by: "user-admin", start_date: "2025-01-15", due_date: "2025-02-10", completed_at: "2025-02-10", created_at: "2024-12-20T09:00:00.000Z", updated_at: "2025-02-10T14:00:00.000Z" },
];

export const dashboardMetrics: DashboardMetrics = {
  activeProjectsCount: 2,
  activeTotalArea: 730,
  completedArea: 155,
  remainingArea: 575,
  overdueProjects: 1,
  overdueTasks: 1,
  openTasks: 2,
  completedTasksPeriod: 4,
  recentProductivity: 78,
  workload: [
    { userId: "user-anna", fullName: "Anna Shevchenko", assignedArea: 460, completedArea: 130, activeProjects: 2, openTasks: 1 },
    { userId: "user-oleksandr", fullName: "Oleksandr Malik", assignedArea: 150, completedArea: 40, activeProjects: 1, openTasks: 1 },
    { userId: "user-maria", fullName: "Maria Hryc", assignedArea: 120, completedArea: 40, activeProjects: 1, openTasks: 0 },
  ],
};

export const employeeWorkload: EmployeeWorkloadSummary[] = [
  { user_id: "user-anna", full_name: "Anna Shevchenko", job_title: "Senior Interior Designer", avatar_url: studioProfiles[1].avatar_url, active_project_count: 2, assigned_area_m2: 460, completed_area_m2: 130, remaining_area_m2: 330, open_tasks: 1, overdue_tasks: 0 },
  { user_id: "user-oleksandr", full_name: "Oleksandr Malik", job_title: "Project Designer", avatar_url: studioProfiles[2].avatar_url, active_project_count: 1, assigned_area_m2: 150, completed_area_m2: 40, remaining_area_m2: 110, open_tasks: 1, overdue_tasks: 1 },
  { user_id: "user-maria", full_name: "Maria Hryc", job_title: "Visualizer", avatar_url: studioProfiles[3].avatar_url, active_project_count: 1, assigned_area_m2: 120, completed_area_m2: 40, remaining_area_m2: 80, open_tasks: 0, overdue_tasks: 0 },
];

export const leaderboardEntries: LeaderboardEntry[] = [
  { rank: 1, user_id: "user-anna", full_name: "Anna Shevchenko", avatar_url: studioProfiles[1].avatar_url, job_title: "Senior Interior Designer", completed_area_m2: 130, completed_tasks: 3, completed_projects: 1, current_workload_m2: 460, rank_change: 1 },
  { rank: 2, user_id: "user-maria", full_name: "Maria Hryc", avatar_url: studioProfiles[3].avatar_url, job_title: "Visualizer", completed_area_m2: 40, completed_tasks: 1, completed_projects: 0, current_workload_m2: 120, rank_change: 0 },
  { rank: 3, user_id: "user-oleksandr", full_name: "Oleksandr Malik", avatar_url: studioProfiles[2].avatar_url, job_title: "Project Designer", completed_area_m2: 40, completed_tasks: 0, completed_projects: 0, current_workload_m2: 150, rank_change: -1 },
];

export const currentUserMockId = "user-anna";

export function getCurrentUser() {
  return studioProfiles.find((profile) => profile.id === currentUserMockId) ?? studioProfiles[0];
}

export function getDashboardMetrics(): DashboardMetrics {
  return dashboardMetrics;
}

export function getAccessibleProjects(): ProjectSummary[] {
  return studioProjects.map((project) => {
    const completedArea = projectAreaProgress.filter((entry) => entry.project_id === project.id).reduce((sum, entry) => sum + entry.area_m2, 0);
    const progress = Math.round((completedArea / project.total_area_m2) * 100);
    return {
      ...project,
      completed_area_m2: completedArea,
      progress_percentage: Number.isFinite(progress) ? progress : 0,
      assigned_employees: projectMembers.filter((member) => member.project_id === project.id && member.is_active).map((member) => studioProfiles.find((profile) => profile.id === member.user_id)?.full_name ?? "Unknown"),
      overdue: new Date(project.due_date ?? "") < new Date("2026-07-19"),
      memberCount: projectMembers.filter((member) => member.project_id === project.id && member.is_active).length,
    };
  });
}

export function getProjectById(id: string): ProjectSummary | undefined {
  const project = studioProjects.find((item) => item.id === id);
  if (!project) return undefined;
  const completedArea = projectAreaProgress.filter((entry) => entry.project_id === project.id).reduce((sum, entry) => sum + entry.area_m2, 0);
  return {
    ...project,
    completed_area_m2: completedArea,
    progress_percentage: Math.round((completedArea / project.total_area_m2) * 100),
    assigned_employees: projectMembers.filter((member) => member.project_id === project.id && member.is_active).map((member) => studioProfiles.find((profile) => profile.id === member.user_id)?.full_name ?? "Unknown"),
    overdue: new Date(project.due_date ?? "") < new Date("2026-07-19"),
    memberCount: projectMembers.filter((member) => member.project_id === project.id && member.is_active).length,
  };
}

export function getMyTasks(): TaskSummary[] {
  return studioTasks
    .filter((task) => task.assignee_id === currentUserMockId)
    .map((task) => ({
      ...task,
      project_name: studioProjects.find((project) => project.id === task.project_id)?.name ?? "Unknown",
      assignee_name: studioProfiles.find((profile) => profile.id === task.assignee_id)?.full_name ?? "Unknown",
      overdue: new Date(task.due_date ?? "") < new Date("2026-07-19") && task.status !== "completed",
    }));
}

export function getTeamMembers() {
  return studioProfiles.filter((profile) => profile.is_active && profile.system_role === "employee");
}

export function getEmployeeWorkload(): EmployeeWorkloadSummary[] {
  return employeeWorkload;
}

export function getLeaderboard(): LeaderboardEntry[] {
  return leaderboardEntries;
}

export function getProjectAreaProgress(projectId: string): ProjectAreaProgressEntry[] {
  return projectAreaProgress.filter((entry) => entry.project_id === projectId);
}
