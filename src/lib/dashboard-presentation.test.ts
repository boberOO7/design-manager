import { describe, expect, it } from "vitest";
import { DASHBOARD_EMPTY_STATES, DASHBOARD_SECTIONS, getAdminDashboardMetrics, getAttentionProjectReason, getDashboardDeadlineHref, getEmployeeDashboardMetrics } from "./dashboard-presentation";

describe("dashboard presentation helpers", () => {
  it("preserves the role-specific metric order", () => {
    expect(getAdminDashboardMetrics({ activeProjects: 1, openTasks: 2, overdueTasks: 3, dueThisWeek: 4 }).map((metric) => metric.labelKey)).toEqual(["metricActiveProjects", "metricOpenTasks", "metricOverdueTasks", "metricDueThisWeek"]);
    expect(getEmployeeDashboardMetrics({ overdue: 1, dueToday: 2, inProgress: 3, upcoming: 4 }).map((metric) => metric.labelKey)).toEqual(["metricOverdueTasks", "metricDueToday", "metricInProgress", "metricUpcoming"]);
  });

  it("maps overdue and due-soon emphasis truthfully without decorating zero states", () => {
    expect(getAdminDashboardMetrics({ activeProjects: 0, openTasks: 0, overdueTasks: 2, dueThisWeek: 1 }).map((metric) => metric.tone)).toEqual(["neutral", "neutral", "danger", "warning"]);
    expect(getEmployeeDashboardMetrics({ overdue: 0, dueToday: 0, inProgress: 1, upcoming: 1 }).map((metric) => metric.tone)).toEqual(["neutral", "neutral", "neutral", "neutral"]);
  });

  it("keeps compact empty messages, role boundaries, and project deep links", () => {
    expect(DASHBOARD_EMPTY_STATES.employeeAttention.title).toBe("You have no assigned work requiring attention.");
    expect(DASHBOARD_SECTIONS.admin).not.toContain("projects");
    expect(DASHBOARD_SECTIONS.employee).not.toContain("workload");
    expect(getDashboardDeadlineHref({ id: "task-1", project: { id: "project-1" } })).toBe("/projects/project-1");
    expect(getDashboardDeadlineHref({ id: "project-1" })).toBe("/projects/project-1");
  });

  it("keeps attention reasons grounded in existing overdue, deadline, and urgent signals", () => {
    expect(getAttentionProjectReason({ overdueCount: 2, deadlineDaysAway: 0, urgentCount: 1 })).toBe("2 overdue tasks · Deadline today · 1 urgent task");
  });
});
