import { formatDate } from "./utils";

export type DashboardRole = "admin" | "employee";
export type DashboardMetricTone = "neutral" | "warning" | "danger";

export type DashboardMetric = {
  labelKey: "metricActiveProjects" | "metricOpenTasks" | "metricOverdueTasks" | "metricActiveLeads" | "metricExpectedInflow" | "metricProfitLoss" | "metricInProgress" | "metricInReview" | "metricCompletedMonth" | "metricProductivity" | "metricVacationBalance" | "metricNextAbsence";
  value: string | number;
  tone: DashboardMetricTone;
};

export const DASHBOARD_SECTIONS = {
  admin: ["attention", "deadlines", "workload", "my-tasks"],
  employee: ["attention", "my-tasks", "deadlines", "projects"],
} as const satisfies Record<DashboardRole, readonly string[]>;

export const DASHBOARD_EMPTY_STATES = {
  adminAttention: { title: "No projects currently require attention." },
  employeeAttention: { title: "You have no assigned work requiring attention.", description: "You have no overdue or urgent tasks.", linkHref: "/my-tasks", linkLabel: "View My Tasks" },
  deadlines: { title: "No upcoming deadlines in the next 14 days." },
  workload: { title: "No active studio members." },
  myTasks: { title: "No open tasks assigned to you." },
  projects: { title: "No active project assignments." },
} as const;

export function getAdminDashboardMetrics(metrics: { activeProjects: number; activeTasks: number; overdueTasks: number; activeLeads: number; expectedInflow: string; profitAndLoss: string }): DashboardMetric[] {
  return [
    { labelKey: "metricActiveProjects", value: metrics.activeProjects, tone: "neutral" },
    { labelKey: "metricOpenTasks", value: metrics.activeTasks, tone: "neutral" },
    { labelKey: "metricOverdueTasks", value: metrics.overdueTasks, tone: metrics.overdueTasks ? "danger" : "neutral" },
    { labelKey: "metricActiveLeads", value: metrics.activeLeads, tone: "neutral" },
    { labelKey: "metricExpectedInflow", value: metrics.expectedInflow, tone: "neutral" },
    { labelKey: "metricProfitLoss", value: metrics.profitAndLoss, tone: metrics.profitAndLoss.startsWith("-") ? "danger" : "neutral" },
  ];
}

export function getEmployeeDashboardMetrics(metrics: { overdue: number; inProgress: number; inReview: number; completedThisMonth: number; productivity: { areaM2: number; rank?: number | null }; vacationBalance: number | null; nextAbsence: string | null }, locale: string): DashboardMetric[] {
  const area = `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(metrics.productivity.areaM2)} m²`;
  return [
    { labelKey: "metricInProgress", value: metrics.inProgress, tone: "neutral" },
    { labelKey: "metricInReview", value: metrics.inReview, tone: "neutral" },
    { labelKey: "metricOverdueTasks", value: metrics.overdue, tone: metrics.overdue ? "danger" : "neutral" },
    { labelKey: "metricCompletedMonth", value: metrics.completedThisMonth, tone: "neutral" },
    { labelKey: "metricProductivity", value: metrics.productivity.rank == null ? area : `#${metrics.productivity.rank} · ${area}`, tone: "neutral" },
    metrics.vacationBalance !== null
      ? { labelKey: "metricVacationBalance", value: metrics.vacationBalance, tone: "neutral" }
      : { labelKey: "metricNextAbsence", value: metrics.nextAbsence ? formatDate(metrics.nextAbsence, locale) : "—", tone: "neutral" },
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
