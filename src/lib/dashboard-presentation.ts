export type DashboardRole = "admin" | "employee";
export type DashboardMetricTone = "neutral" | "warning" | "danger";

export type DashboardMetric = {
  labelKey: "metricActiveProjects" | "metricOpenTasks" | "metricOverdueTasks" | "metricDueThisWeek" | "metricDueToday" | "metricInProgress" | "metricUpcoming";
  value: number;
  descriptionKey: "metricActiveProjectsHint" | "metricOpenTasksHint" | "metricOverdueTasksHint" | "metricDueThisWeekHint" | "metricDueTodayHint" | "metricInProgressHint" | "metricUpcomingHint";
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
    { labelKey: "metricActiveProjects", value: metrics.activeProjects, descriptionKey: "metricActiveProjectsHint", tone: "neutral" },
    { labelKey: "metricOpenTasks", value: metrics.openTasks, descriptionKey: "metricOpenTasksHint", tone: "neutral" },
    { labelKey: "metricOverdueTasks", value: metrics.overdueTasks, descriptionKey: "metricOverdueTasksHint", tone: metrics.overdueTasks > 0 ? "danger" : "neutral" },
    { labelKey: "metricDueThisWeek", value: metrics.dueThisWeek, descriptionKey: "metricDueThisWeekHint", tone: metrics.dueThisWeek > 0 ? "warning" : "neutral" },
  ];
}

export function getEmployeeDashboardMetrics(metrics: { overdue: number; dueToday: number; inProgress: number; upcoming: number }): DashboardMetric[] {
  return [
    { labelKey: "metricOverdueTasks", value: metrics.overdue, descriptionKey: "metricOverdueTasksHint", tone: metrics.overdue > 0 ? "danger" : "neutral" },
    { labelKey: "metricDueToday", value: metrics.dueToday, descriptionKey: "metricDueTodayHint", tone: metrics.dueToday > 0 ? "warning" : "neutral" },
    { labelKey: "metricInProgress", value: metrics.inProgress, descriptionKey: "metricInProgressHint", tone: "neutral" },
    { labelKey: "metricUpcoming", value: metrics.upcoming, descriptionKey: "metricUpcomingHint", tone: "neutral" },
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
