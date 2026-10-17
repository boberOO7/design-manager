import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import type { FinanceOverview } from "@/lib/finance-overview";
import { getFinanceOverviewCashAnalysis } from "./finance-overview-dashboard";

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), rates: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFxDates: mocks.rates }));
const context: Pick<FinanceOverview, "forecast"> = { forecast: {
  version: 1, asOf: "2026-02-17", from: "2026-02-01", through: "2026-07-31", cutover: "2026-01-01", currency: "UAH", scenario: "confirmed", horizon: "6", fx: [], cashBase: "0", cashIncomplete: false, comparisons: [], months: [], items: [], issues: [],
} };

// These queries only need the existing report's currency/date context.
const source = { ...context, period: "month", actualFrom: "2026-02-01", upcomingThrough: "2026-03-19", historyIncomplete: false, history: [], projection: [], lowPoint: { date: "2026-02-17", amount: "0" }, flows: [], netFlow: "0", accounts: [], receivables: [], receivableTotal: "0", receivablesIncomplete: false, outgoingTotal: "0", outgoingIncomplete: false, categories: [], requiredCurrencies: [] } satisfies FinanceOverview;

describe("Overview monthly actuals query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id: "active-studio" });
    mocks.rates.mockResolvedValue(new Map([["2026-02-01", "0.025"], ["2026-02-02", "0.02"]]));
  });
  it("denies access before reading cash movements or exchange rates", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await getFinanceOverviewCashAnalysis(source, { code: "USD", minor_units: 2 })).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rates).not.toHaveBeenCalled();
  });
  it("reads the rolling window from normalized actuals and applies each financial date's rate before summing", async () => {
    const urls: URL[] = [];
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async input => {
      urls.push(new URL(String(input)));
      return Response.json([
        { financial_date: "2026-02-01", direction: "incoming", nature: "operating", amount: "400.00" },
        { financial_date: "2026-02-02", direction: "incoming", nature: "operating", amount: "-50.00" },
        { financial_date: "2026-02-02", direction: "outgoing", nature: "owner_distribution", amount: "100.00" },
      ]);
    } } }));
    const result = await getFinanceOverviewCashAnalysis(source, { code: "USD", minor_units: 2 });
    expect(urls[0].pathname).toBe("/rest/v1/finance_planning_actuals");
    expect(urls[0].searchParams.get("studio_id")).toBe("eq.active-studio");
    expect(urls[0].searchParams.getAll("financial_date")).toEqual(["gte.2025-03-01", "lte.2026-02-17"]);
    expect(mocks.rates).toHaveBeenCalledWith("UAH", "USD", ["2026-02-01", "2026-02-02"]);
    expect(result?.months.at(-1)).toMatchObject({ incoming: "9.00", outgoing: "2.00", net: "7.00" });
    const base = await getFinanceOverviewCashAnalysis(source, { code: "UAH", minor_units: 2 });
    expect(base?.months.at(-1)).toMatchObject({ incoming: "350.00", outgoing: "100.00", net: "250.00" });
    expect(mocks.rates).toHaveBeenCalledOnce();
  });
  it("retains missing valuations and fails explicitly when historical FX is unavailable", async () => {
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async () => Response.json([
      { financial_date: "2026-02-01", direction: "incoming", nature: "operating", amount: null },
    ]) } }));
    expect((await getFinanceOverviewCashAnalysis(source, { code: "UAH", minor_units: 2 }))?.months.at(-1)?.incoming).toBeNull();
    mocks.rates.mockRejectedValue(new Error("FX unavailable"));
    await expect(getFinanceOverviewCashAnalysis(source, { code: "USD", minor_units: 2 })).rejects.toThrow("FX unavailable");
  });
});
