import { Children, isValidElement, Suspense, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinancePage from "./page";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { PageHeader } from "@/components/shared/page-header";

const mocks = vi.hoisted(() => ({ foundation: vi.fn(), currency: vi.fn(), management: vi.fn(), cash: vi.fn(), display: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation }));
vi.mock("@/data/queries/finance-display-currency", () => ({ getFinanceDisplayCurrency: mocks.currency }));
vi.mock("@/data/queries/finance-management", () => ({ getFinanceManagement: mocks.management }));
vi.mock("@/data/queries/finance-overview", () => ({ getFinanceOverview: mocks.cash, getFinanceDisplayOverview: mocks.display }));
vi.mock("@/components/finance/finance-workspace", () => ({ FinanceWorkspace: () => null }));
vi.mock("@/components/finance/finance-overview", () => ({ FinanceOverviewCash: () => null }));
vi.mock("@/components/finance/finance-analytics", () => ({ FinanceAnalyticsSection: () => null }));
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
const foundation = { settings: { finalized_at: "2026-10-14", recognition_start_month: null }, accounts: [], currencies: [], balances: [], categories: [] };
const props = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.foundation.mockResolvedValue(foundation);
  mocks.management.mockResolvedValue(null);
  mocks.cash.mockResolvedValue(null);
  mocks.currency.mockResolvedValue("UAH");
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});

describe("Finance streamed shell", () => {
  it("renders a value-free shell while foundation is still pending, without starting maintenance or labor work", async () => {
    const data = deferred<typeof foundation>();
    mocks.foundation.mockReturnValue(data.promise);
    const route = element(FinancePage(props));
    expect(route.type).toBe(Suspense);
    const pending = render(route.props.children);
    const shell = element(await render(route.props.fallback));
    expect(Children.toArray(shell.props.children).map(element)[0].type).toBe(PageHeader);
    expect(mocks.currency).not.toHaveBeenCalled();
    expect(mocks.management).not.toHaveBeenCalled();
    expect(mocks.cash).not.toHaveBeenCalled();
    data.resolve(foundation);
    await pending;
  });

  it("allows Analytics and Cash to resolve independently of the delayed currency control", async () => {
    const currency = deferred<string>();
    mocks.currency.mockReturnValue(currency.promise);
    const content = element(await render(element(FinancePage(props)).props.children));
    const [header, analytics, cash] = Children.toArray(content.props.children).map(element);
    const actions = Children.toArray(element(header.props.action).props.children).map(element);
    const control = actions.find(action => action.type === Suspense);
    expect(control).toBeDefined();
    const pendingControl = render(control?.props.children);
    expect(analytics.type).toBe(Suspense);
    expect(cash.type).toBe(Suspense);
    await render(analytics.props.children);
    expect(mocks.management).toHaveBeenCalledOnce();
    // Cash also waits for the real currency before projecting values.
    const pendingCash = render(cash.props.children);
    expect(mocks.cash).toHaveBeenCalledOnce();
    expect(mocks.display).not.toHaveBeenCalled();
    currency.resolve("UAH");
    await Promise.all([pendingControl, pendingCash]);
  });

  it("retains the draft setup branch without starting reporting or automatic labor", async () => {
    mocks.foundation.mockResolvedValue({ ...foundation, settings: null });
    expect(element(await render(element(FinancePage(props)).props.children)).type).toBe(FinanceWorkspace);
    expect(mocks.management).not.toHaveBeenCalled();
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(mocks.currency).not.toHaveBeenCalled();
  });

  it.each(["analytics", "cash"] as const)("keeps the sibling stream available while %s data is delayed", async stream => {
    const data = deferred<null>();
    (stream === "analytics" ? mocks.management : mocks.cash).mockReturnValue(data.promise);
    const content = element(await render(element(FinancePage(props)).props.children));
    const [, analytics, cash] = Children.toArray(content.props.children).map(element);
    const delayed = stream === "analytics" ? analytics : cash;
    const sibling = stream === "analytics" ? cash : analytics;
    let finished = false;
    const pending = render(delayed.props.children).then(() => { finished = true; });
    await render(sibling.props.children);
    expect(finished).toBe(false);
    data.resolve(null);
    await pending;
  });

  it("retains the unauthorized redirect before any section query", async () => {
    mocks.foundation.mockResolvedValue(null);
    await expect(render(element(FinancePage(props)).props.children)).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.management).not.toHaveBeenCalled();
    expect(mocks.cash).not.toHaveBeenCalled();
  });
});
