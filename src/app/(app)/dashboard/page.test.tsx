import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), administration: vi.fn(), operations: vi.fn() }));
vi.mock("@/data/queries/dashboard", () => ({ getDashboard: mocks.dashboard }));
vi.mock("@/data/queries/dashboard-administration", () => ({ getDashboardAdministration: mocks.administration }));
vi.mock("@/data/queries/dashboard-operations", () => ({ getDashboardOperations: mocks.operations }));
vi.mock("@/components/dashboard/admin-dashboard", () => ({ AdminDashboardView: () => null }));
vi.mock("@/components/tasks/dashboard-task-list", () => ({ DashboardTaskList: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
import DashboardPage from "./page";

it("loads admin-only summaries after resolving the admin dashboard", async () => {
  mocks.dashboard.mockResolvedValue({ kind: "admin", today: "2026-09-25" });
  mocks.administration.mockResolvedValue(null);
  mocks.operations.mockResolvedValue(null);
  await DashboardPage();
  expect(mocks.administration).toHaveBeenCalledOnce();
  expect(mocks.operations).toHaveBeenCalledWith("2026-09-25");
});

it("does not request admin summaries for an employee", async () => {
  mocks.administration.mockClear();
  mocks.operations.mockClear();
  mocks.dashboard.mockResolvedValue({ kind: "employee", today: "2026-09-25", profile: { id: "me" }, metrics: { inProgress: 0, inReview: 0, overdue: 0, completedThisMonth: 0, productivity: { areaM2: 0 }, vacationBalance: null, nextAbsence: null }, myTasks: [], myAssignments: [], needsAttention: [], attention: [], deadlines: [], projects: [] });
  await DashboardPage();
  expect(mocks.administration).not.toHaveBeenCalled();
  expect(mocks.operations).not.toHaveBeenCalled();
});
