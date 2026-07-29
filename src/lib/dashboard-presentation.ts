export type DashboardRole = "admin" | "employee";
export type DashboardMetricTone = "neutral" | "warning" | "danger";

export type DashboardMetric = {
  label: string;
  value: number;
  description: string;
  tone: DashboardMetricTone;
};

export const DASHBOARD_SECTIONS = {
  admin: ["attention", "deadlines", "workload", "my-tasks"],
  employee: ["attention", "deadlines", "projects"],
} as const satisfies Record<DashboardRole, readonly string[]>;

export const DASHBOARD_EMPTY_STATES = {
  adminAttention: { title: "No projects currently require attention." },
  employeeAttention: {
    title: "You have no assigned work requiring attention.",
    description: "You have no overdue, urgent, or near-due tasks.",
    linkHref: "/my-tasks",
    linkLabel: "View My Tasks",
  },
  deadlines: { title: "No upcoming deadlines in the next 14 days." },
  workload: { title: "No active studio members." },
  myTasks: { title: "No open tasks assigned to you." },
  projects: { title: "No active project assignments." },
} as const;

export function getAdminDashboardMetrics(metrics: { activeProjects: number; openTasks: number; overdueTasks: number; dueThisWeek: number }): DashboardMetric[] {
  return [
    { label: "Active projects", value: metrics.activeProjects, description: "Planned, active, or paused", tone: "neutral" },
    { label: "Open tasks", value: metrics.openTasks, description: "Excludes completed and cancelled", tone: "neutral" },
    { label: "Overdue tasks", value: metrics.overdueTasks, description: "Open work past due", tone: metrics.overdueTasks > 0 ? "danger" : "neutral" },
    { label: "Due this week", value: metrics.dueThisWeek, description: "Today through Sunday", tone: metrics.dueThisWeek > 0 ? "warning" : "neutral" },
  ];
}

export function getEmployeeDashboardMetrics(metrics: { overdue: number; dueToday: number; inProgress: number; upcoming: number }): DashboardMetric[] {
  return [
    { label: "Overdue", value: metrics.overdue, description: "Open tasks past due", tone: metrics.overdue > 0 ? "danger" : "neutral" },
    { label: "Due today", value: metrics.dueToday, description: "Open tasks due today", tone: metrics.dueToday > 0 ? "warning" : "neutral" },
    { label: "In progress", value: metrics.inProgress, description: "Including review", tone: "neutral" },
    { label: "Upcoming", value: metrics.upcoming, description: "Due in the next 7 days", tone: "neutral" },
  ];
}

export function getDashboardDeadlineHref(deadline: { id: string; project?: { id: string } }): string {
  return `/projects/${deadline.project?.id ?? deadline.id}`;
}

export function getAttentionProjectReason(project: { deadlineDaysAway: number | null; overdueCount: number; urgentCount: number }): string {
  return [
    project.overdueCount ? `${project.overdueCount} overdue task${project.overdueCount === 1 ? "" : "s"}` : null,
    project.deadlineDaysAway !== null ? `Deadline ${project.deadlineDaysAway === 0 ? "today" : `in ${project.deadlineDaysAway} days`}` : null,
    project.urgentCount ? `${project.urgentCount} urgent task${project.urgentCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
}
