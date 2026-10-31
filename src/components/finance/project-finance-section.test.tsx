import { beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ComponentProps } from "react";
import type { ProjectFinanceWorkspace } from "./project-finance-workspace";

const mocks = vi.hoisted(() => ({ foundation: vi.fn(), project: vi.fn(), planning: vi.fn(), cash: vi.fn(), management: vi.fn(), currency: vi.fn(), rate: vi.fn() }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation, getFinanceProject: mocks.project, getFinancePlanning: mocks.planning }));
vi.mock("@/data/queries/finance-project-cash", () => ({ getFinanceProjectCash: mocks.cash }));
vi.mock("@/data/queries/finance-management", () => ({ getFinanceManagement: mocks.management }));
vi.mock("@/data/queries/finance-display-currency", () => ({ getFinanceDisplayCurrency: mocks.currency }));
vi.mock("@/data/queries/finance-overview", () => ({ getFinanceDisplayRate: mocks.rate }));
vi.mock("./project-finance-workspace", () => ({ ProjectFinanceWorkspace: () => null }));
vi.mock("./project-result-workspace", () => ({ ProjectResultWorkspace: () => null }));
vi.mock("./project-trips-section", () => ({ ProjectTripsSection: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import { ProjectFinanceSection } from "./project-finance-section";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const foundation = { settings: { finalized_at: "2026-10-31", base_currency: "USD" }, currencies: [{ code: "USD", minor_units: 2 }], accounts: [], balances: [], categories: [] };
const project = { directions: [{ id: "interior" }], orders: [{ id: "interior-order", draft_plan: null }, { id: "other-order", draft_plan: null }], directionLinks: [{ order_id: "interior-order", direction_id: "interior" }], orderTotals: [], totals: [], terms: [] };
const planning = { items: [] };
async function section(query = {}, directionId?: string) {
  const node = await ProjectFinanceSection({ projectId: "project", query, directionId });
  if (!isValidElement<ComponentProps<typeof ProjectFinanceWorkspace>>(node)) throw new Error("Workspace missing");
  return node.props;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.foundation.mockResolvedValue(foundation);
  mocks.project.mockResolvedValue(project);
  mocks.planning.mockResolvedValue(planning);
  mocks.cash.mockResolvedValue(null);
  mocks.management.mockResolvedValue(null);
  mocks.currency.mockResolvedValue("USD");
  mocks.rate.mockResolvedValue("1.2");
});

it("starts independent reads together and returns the header while planning and cash are still pending", async () => {
  const base = deferred<typeof foundation>(), list = deferred<typeof planning>(), cash = deferred<null>();
  mocks.foundation.mockReturnValue(base.promise);
  mocks.planning.mockReturnValue(list.promise);
  mocks.cash.mockReturnValue(cash.promise);
  const pending = section();
  expect(mocks.planning).toHaveBeenCalledOnce();
  expect(mocks.cash).toHaveBeenCalledOnce();
  base.resolve(foundation);
  const shell = await pending;
  expect(shell.display?.rates).toEqual({ USD: "1" });
  expect(shell.cashPending).toBe(cash.promise);
  list.resolve(planning);
  expect(await shell.planning).toMatchObject({ data: planning });
  cash.resolve(null);
});

it("keeps list-only exchange rates out of the header's critical path without mutating its delivered rates", async () => {
  const list = deferred<{ items: { currency: string }[] }>(), rate = deferred<string>();
  mocks.planning.mockReturnValue(list.promise);
  mocks.rate.mockReturnValue(rate.promise);
  const shell = await section();
  list.resolve({ items: [{ currency: "EUR" }, { currency: "EUR" }] });
  await Promise.resolve();
  expect(mocks.rate).toHaveBeenCalledOnce();
  expect(mocks.rate).toHaveBeenCalledWith("EUR", "USD", expect.any(String));
  rate.resolve("1.2");
  expect((await shell.planning)?.display?.rates).toEqual({ USD: "1", EUR: "1.2" });
  expect(shell.display?.rates).toEqual({ USD: "1" });
});

it("waits for the authorized direction's orders before scoping its planning request", async () => {
  const data = deferred<typeof project>();
  mocks.project.mockReturnValue(data.promise);
  const pending = section({}, "interior");
  expect(mocks.planning).not.toHaveBeenCalled();
  expect(mocks.cash).not.toHaveBeenCalled();
  data.resolve(project);
  const shell = await pending;
  expect(mocks.planning).toHaveBeenCalledExactlyOnceWith(1, 1, "all", "project", "design", "all", expect.any(String), undefined, undefined, undefined, ["interior-order"]);
  expect(shell.project.orders.map(order => order.id)).toEqual(["interior-order"]);
  expect(shell.surfaceKey).toBe("finance:interior:stream=design&financeTab=payments");
});

it("preserves missing-data and load errors in the deferred planning stream", async () => {
  mocks.planning.mockResolvedValue(null);
  await expect((await section()).planning).rejects.toThrow("NOT_FOUND");
  mocks.planning.mockRejectedValue(new Error("planning failed"));
  await expect((await section()).planning).rejects.toThrow("planning failed");
});

it("returns the header without waiting for the result report or starting payment reads", async () => {
  const report = deferred<null>();
  mocks.management.mockReturnValue(report.promise);
  const shell = await section({ financeTab: "result" });
  expect(shell.tab).toBe("result");
  expect(shell.planning).toBeNull();
  expect(mocks.management).toHaveBeenCalledOnce();
  expect(mocks.planning).not.toHaveBeenCalled();
  expect(mocks.cash).not.toHaveBeenCalled();
  report.resolve(null);
});

it("does not return a header for an unavailable project or direction", async () => {
  await expect(section({}, "unavailable")).rejects.toThrow("NOT_FOUND");
  expect(mocks.planning).not.toHaveBeenCalled();
  mocks.project.mockResolvedValue(null);
  await expect(section()).rejects.toThrow("NOT_FOUND");
});
