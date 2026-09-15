import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), administration: vi.fn() }));
vi.mock("@/data/queries/dashboard", () => ({ getDashboard: mocks.dashboard }));
vi.mock("@/data/queries/dashboard-administration", () => ({ getDashboardAdministration: mocks.administration }));
vi.mock("@/components/tasks/dashboard-task-list", () => ({ DashboardTaskList: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
import DashboardPage from "./page";

it("starts the guarded administration summary before the main Dashboard finishes", async () => {
  let finish: (reason: Error) => void = () => {};
  mocks.dashboard.mockReturnValue(new Promise((_, reject) => { finish = reject; }));
  mocks.administration.mockResolvedValue(null);
  const loading = DashboardPage();
  const stopped = new Error("Finish the held Dashboard read");
  const completed = expect(loading).rejects.toBe(stopped);
  try {
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.administration).toHaveBeenCalledOnce();
  } finally {
    finish(stopped);
    await completed;
  }
});
