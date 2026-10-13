import { expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), dashboard: vi.fn(), administration: vi.fn(), operations: vi.fn(), finance: vi.fn() }));
vi.mock("@/data/queries/dashboard", () => ({ getDashboard: mocks.dashboard, getDashboardContext: mocks.context }));
vi.mock("@/data/queries/dashboard-administration", () => ({ getDashboardAdministration: mocks.administration }));
vi.mock("@/data/queries/dashboard-operations", () => ({ getDashboardOperationalSignals: mocks.operations, getDashboardFinanceSummary: mocks.finance }));
vi.mock("@/components/dashboard/admin-dashboard", () => ({ AdminDashboardView: () => null }));
vi.mock("@/components/dashboard/dashboard-motion", () => ({ DashboardReady: () => null }));
vi.mock("@/components/tasks/dashboard-task-list", () => ({ DashboardTaskList: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
import DashboardPage from "./page";

beforeEach(() => vi.clearAllMocks());

it("returns the streaming tree while Tasks and Finance remain pending, with one call per source", async () => {
  mocks.context.mockResolvedValue({ membership: { system_role: "admin" }, today: "2026-09-25" });
  mocks.dashboard.mockImplementationOnce(() => new Promise(() => {}));
  mocks.finance.mockImplementationOnce(() => new Promise(() => {}));
  mocks.administration.mockResolvedValue(null);
  mocks.operations.mockResolvedValue(null);
  const page = await DashboardPage();
  expect(page).toBeTruthy();
  expect(mocks.dashboard).toHaveBeenCalledOnce();
  expect(mocks.finance).toHaveBeenCalledOnce();
  expect(mocks.administration).toHaveBeenCalledOnce();
  expect(mocks.operations).toHaveBeenCalledExactlyOnceWith("2026-09-25");
});

it("does not request admin sources for an employee", async () => {
  mocks.context.mockResolvedValue({ membership: { system_role: "employee" }, today: "2026-09-25" });
  mocks.dashboard.mockImplementationOnce(() => new Promise(() => {}));
  await DashboardPage();
  expect(mocks.administration).not.toHaveBeenCalled();
  expect(mocks.operations).not.toHaveBeenCalled();
  expect(mocks.finance).not.toHaveBeenCalled();
});
