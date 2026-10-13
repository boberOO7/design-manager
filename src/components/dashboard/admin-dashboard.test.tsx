import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { FinanceMetrics, FinanceStatus } from "./admin-dashboard";
import type { DashboardOperations } from "@/data/queries/dashboard-operations";
import type { DashboardMetric } from "@/lib/dashboard-presentation";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));
vi.mock("@/components/tasks/dashboard-task-list", () => ({ DashboardTaskList: () => null }));
vi.mock("@/components/dashboard/team-workload", () => ({ TeamWorkload: () => null }));

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
  if (!isValidElement<{ children?: ReactNode; role?: string; metric?: DashboardMetric; metrics?: DashboardMetric[] }>(node)) return { statuses: [], metrics: [] };
  const children = inspect(node.props.children);
  return { statuses: [...children.statuses, ...(node.props.role === "status" ? [node.props.children] : [])], metrics: [...children.metrics, ...(node.props.metrics ?? []), ...(node.props.metric ? [node.props.metric] : [])] };
}

it("makes unavailable Finance explicit without presenting missing amounts as zero", async () => {
  const result = inspect([await FinanceMetrics({ pending: Promise.resolve(operations) }), await FinanceStatus({ pending: Promise.resolve(operations) })]);
  expect(result.statuses).toContain("financeUnavailable");
  expect(result.metrics.map(metric => metric.value)).toEqual(["—", "—"]);
});

it("does not show an error when Finance setup has not been completed", async () => {
  const result = inspect(await FinanceStatus({ pending: Promise.resolve({ ...operations, financeUnavailable: false }) }));
  expect(result.statuses).not.toContain("financeUnavailable");
});
