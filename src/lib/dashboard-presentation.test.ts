import { describe, expect, it } from "vitest";
import { DASHBOARD_EMPTY_STATES, DASHBOARD_SECTIONS, getAdminDashboardMetrics, getAttentionProjectReason, getDashboardDeadlineHref, getEmployeeDashboardMetrics } from "./dashboard-presentation";
import { selectPersonalDashboardProductivity } from "./productivity";

describe("dashboard selectors", () => {
  it("keeps six admin KPIs in the requested order and preserves domain values", () => {
    const metrics = getAdminDashboardMetrics({ activeProjects: 4, activeTasks: 7, overdueTasks: 2, activeLeads: 3, expectedInflow: "12500.00 UAH", profitAndLoss: "-230.00 UAH" });
    expect(metrics.map(({ labelKey, value }) => [labelKey, value])).toEqual([
      ["metricActiveProjects", 4], ["metricOpenTasks", 7], ["metricOverdueTasks", 2],
      ["metricActiveLeads", 3], ["metricExpectedInflow", "12500.00 UAH"], ["metricProfitLoss", "-230.00 UAH"],
    ]);
    expect(metrics.map((metric) => metric.tone)).toEqual(["neutral", "neutral", "danger", "neutral", "neutral", "danger"]);
  });

  it("keeps six employee KPIs, with rank only when visibility allows it", () => {
    const entries = [{ user_id: "me", rank: 3, completed_area_m2: 86.58, completed_tasks: 4, full_name: "Me", job_title: "Designer" }];
    const visible = selectPersonalDashboardProductivity(entries, "me", true);
    const hidden = selectPersonalDashboardProductivity(entries, "me", false);
    const base = { inProgress: 2, inReview: 1, overdue: 3, completedThisMonth: 4, vacationBalance: 6, nextAbsence: null };
    const visibleMetrics = getEmployeeDashboardMetrics({ ...base, productivity: visible }, "uk");
    const hiddenMetrics = getEmployeeDashboardMetrics({ ...base, productivity: hidden }, "uk");
    expect(visibleMetrics.map(({ labelKey, value }) => [labelKey, value])).toEqual([
      ["metricInProgress", 2], ["metricInReview", 1], ["metricOverdueTasks", 3],
      ["metricCompletedMonth", 4], ["metricProductivity", "#3 · 86,58 m²"], ["metricVacationBalance", 6],
    ]);
    expect(hiddenMetrics[4].value).toBe("86,58 m²");
    expect(JSON.stringify(hidden)).not.toMatch(/rank|placement|"3"/i);
    expect(JSON.stringify(hiddenMetrics)).not.toContain("#3");
    expect(getEmployeeDashboardMetrics({ ...base, productivity: hidden, vacationBalance: null, nextAbsence: "2026-10-02" }, "en")[5].labelKey).toBe("metricNextAbsence");
  });

  it("keeps role boundaries and project links", () => {
    expect(DASHBOARD_EMPTY_STATES.employeeAttention.title).toBe("You have no assigned work requiring attention.");
    expect(DASHBOARD_SECTIONS.admin).not.toContain("projects");
    expect(DASHBOARD_SECTIONS.employee).not.toContain("workload");
    expect(getDashboardDeadlineHref({ id: "task-1", project: { id: "project-1" } })).toBe("/projects/project-1");
    expect(getAttentionProjectReason({ overdueCount: 2, deadlineDaysAway: 0, urgentCount: 1 })).toBe("2 overdue tasks · Deadline today · 1 urgent task");
  });
});
