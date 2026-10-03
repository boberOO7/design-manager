import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { AdminDashboardView } from "./admin-dashboard";
import type { AdminDashboard } from "@/data/queries/dashboard";
import type { DashboardOperations } from "@/data/queries/dashboard-operations";
import type { DashboardMetric } from "@/lib/dashboard-presentation";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));
vi.mock("@/components/tasks/dashboard-task-list", () => ({ DashboardTaskList: () => null }));
vi.mock("@/components/dashboard/team-workload", () => ({ TeamWorkload: () => null }));

const dashboard: AdminDashboard = {
  kind: "admin", profile: { id: "admin", full_name: "Admin" }, asOf: "2026-10-03T10:00:00Z", today: "2026-10-03",
  metrics: { activeProjects: 2, activeTasks: 3, overdueTasks: 1 },
  attentionProjects: [], deadlines: [], workload: [], myTasks: [],
};
const operations: DashboardOperations = {
  finance: null, financeUnavailable: true,
  crm: { activeCount: 4, overdueCount: 0, upcoming: [] },
  office: { overdueAssignmentCount: 0, myAssignments: [], upcoming: [] },
  equipment: { overdueCount: 0, upcoming: [] }, submissions: { urgentCount: 0 },
};

function inspect(node: ReactNode): { statuses: ReactNode[]; metrics: DashboardMetric[] } {
  if (Array.isArray(node)) {
    const children = node.map(inspect);
    return { statuses: children.flatMap(child => child.statuses), metrics: children.flatMap(child => child.metrics) };
  }
  if (!isValidElement<{ children?: ReactNode; role?: string; metrics?: DashboardMetric[] }>(node)) return { statuses: [], metrics: [] };
  const children = inspect(node.props.children);
  return { statuses: [...children.statuses, ...(node.props.role === "status" ? [node.props.children] : [])], metrics: [...children.metrics, ...(node.props.metrics ?? [])] };
}

it("makes unavailable Finance explicit and keeps other dashboard metrics instead of presenting finance as zero", async () => {
  const result = inspect(await AdminDashboardView({ dashboard, administration: null, operations }));
  expect(result.statuses).toContain("financeUnavailable");
  expect(result.metrics.map(metric => metric.value)).toEqual([2, 3, 1, 4, "—", "—"]);
});

it("does not show an error when Finance setup has not been completed", async () => {
  const result = inspect(await AdminDashboardView({ dashboard, administration: null, operations: { ...operations, financeUnavailable: false } }));
  expect(result.statuses).not.toContain("financeUnavailable");
});
