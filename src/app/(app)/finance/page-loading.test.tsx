import { Children, isValidElement, Suspense, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinancePage from "./page";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { PageHeader } from "@/components/shared/page-header";

const mocks = vi.hoisted(() => ({ foundation: vi.fn(), currency: vi.fn(), management: vi.fn(), cash: vi.fn(), display: vi.fn(), payments: vi.fn(), monthlyCash: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation }));
vi.mock("@/data/queries/finance-display-currency", () => ({ getFinanceDisplayCurrency: mocks.currency }));
vi.mock("@/data/queries/finance-management", () => ({ getFinanceManagement: mocks.management }));
vi.mock("@/data/queries/finance-overview", () => ({ getFinanceOverview: mocks.cash, getFinanceDisplayOverview: mocks.display }));
vi.mock("@/data/queries/finance-overview-dashboard", () => ({ getFinanceOverviewPayments: mocks.payments, getFinanceOverviewCashAnalysis: mocks.monthlyCash }));
vi.mock("@/data/queries/finance-overview-economics", () => ({ getFinanceOverviewProjectEconomics: vi.fn() }));
vi.mock("@/components/finance/overview-project-economics", () => ({ OverviewProjectEconomics: () => null }));
vi.mock("@/components/finance/finance-workspace", () => ({ FinanceWorkspace: () => null }));
vi.mock("@/components/finance/finance-overview", () => ({ FinanceOverviewCash: () => null }));
vi.mock("@/components/finance/display-currency-select", () => ({ DisplayCurrencySelect: () => null }));
vi.mock("@/components/shared/instaload-motion", () => ({ InstaLoadReady: () => null }));

type NodeProps = { children?: ReactNode; fallback?: ReactNode; action?: ReactNode };
function element(node: unknown) {
  if (!isValidElement<NodeProps>(node)) throw new Error("Expected a React element");
  return node;
}
async function render(node: unknown): Promise<unknown> {
  const component = element(node);
  if (typeof component.type !== "function") throw new Error("Expected a server component");
  return Reflect.apply(component.type, null, [component.props]);
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(ready => { resolve = ready; });
  return { promise, resolve };
}
const foundation = { settings: { finalized_at: "2026-10-14" }, accounts: [], currencies: [{ code: "UAH", minor_units: 2 }], balances: [], categories: [] };
const props = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.foundation.mockResolvedValue(foundation);
  mocks.cash.mockResolvedValue(null);
  mocks.currency.mockResolvedValue("UAH");
  mocks.payments.mockResolvedValue([]);
  mocks.monthlyCash.mockResolvedValue([]);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});

describe("Finance cash overview shell", () => {
  it("streams a value-free shell before starting financial queries", async () => {
    const data = deferred<typeof foundation>();
    mocks.foundation.mockReturnValue(data.promise);
    const route = element(FinancePage(props));
    expect(route.type).toBe(Suspense);
    const pending = render(route.props.children);
    const shell = element(await render(route.props.fallback));
    expect(Children.toArray(shell.props.children).map(element)[0].type).toBe(PageHeader);
    expect(mocks.currency).not.toHaveBeenCalled();
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(mocks.management).not.toHaveBeenCalled();
    data.resolve(foundation);
    await pending;
  });

  it("defaults actuals to the current month and keeps currency loading independent of the shell", async () => {
    const currency = deferred<string>();
    mocks.currency.mockReturnValue(currency.promise);
    const content = element(await render(element(FinancePage(props)).props.children));
    const [header, cash] = Children.toArray(content.props.children).map(element);
    expect(header.type).toBe(PageHeader);
    expect(cash.type).toBe(Suspense);
    const control = element(header.props.action);
    const pendingControl = render(control.props.children);
    const pendingCash = render(cash.props.children);
    expect(mocks.cash).toHaveBeenCalledWith(expect.objectContaining({ period: "month", options: { horizon: "6", scenario: "confirmed" } }));
    expect(mocks.management).not.toHaveBeenCalled();
    currency.resolve("UAH");
    await Promise.all([pendingControl, pendingCash]);
  });

  it("retains draft setup without starting reports or labor maintenance", async () => {
    mocks.foundation.mockResolvedValue({ ...foundation, settings: null });
    expect(element(await render(element(FinancePage(props)).props.children)).type).toBe(FinanceWorkspace);
    expect(mocks.management).not.toHaveBeenCalled();
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(mocks.currency).not.toHaveBeenCalled();
  });

  it("redirects unauthorized users before querying any section", async () => {
    mocks.foundation.mockResolvedValue(null);
    await expect(render(element(FinancePage(props)).props.children)).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(mocks.payments).not.toHaveBeenCalled();
  });
});
