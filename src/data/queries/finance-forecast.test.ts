import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getFinanceForecast } from "./finance-forecast";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), admin: vi.fn(), fx: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
const today = "2026-09-17";
const report = {
  version: 1, asOf: today, from: "2026-09-01", through: "2027-02-28", cutover: "2026-01-01", currency: "UAH", scenario: "confirmed", horizon: "6", fx: [], cashBase: "0", cashIncomplete: true,
  comparisons: [], months: [], items: [], issues: [{ source: "account", id: "account", label: "USD bank", reason: "missing_fx", currency: "USD", amount: "100", date: null }],
};
const overview = {
  forecast: report, period: "3", actualFrom: "2026-07-01", upcomingThrough: "2026-10-17", historyIncomplete: false,
  history: [], projection: [], lowPoint: { date: today, amount: "0" }, flows: [], netFlow: "0", accounts: [],
  receivables: [], receivableTotal: "0", receivablesIncomplete: false, outgoingTotal: "0", outgoingIncomplete: true,
  categories: [], requiredCurrencies: [],
};
describe("forecast server query", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "studio" }); mocks.fx.mockResolvedValue({ rate: "40", source: "nbu", effectiveDate: today }); });
  it("does not read data or fetch FX for a non-admin", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await getFinanceForecast({}, 2026)).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled();
  });
  for (const unavailable of [false, true]) it(`preserves missing FX when NBU unavailable=${unavailable}`, async () => {
    if (unavailable) mocks.fx.mockRejectedValue(new Error("unavailable"));
    const calls: { url: URL; body: unknown }[] = [];
    const client = createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      const data = url.pathname.endsWith("/finance_settings") ? { finalized_at: today, base_currency: "UAH" } : url.pathname.endsWith("/get_finance_overview") ? overview : [];
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } } });
    mocks.createClient.mockResolvedValue(client);
    const result = await getFinanceForecast({}, 2026);
    expect(result?.report).toBe(result?.overview?.forecast);
    expect(result?.report?.issues[0].reason).toBe("missing_fx");
    const rpc = calls.filter(c => c.url.pathname.includes("/rpc/"));
    expect(rpc).toHaveLength(unavailable ? 1 : 2);
    expect(rpc[0].body).toEqual({ p_studio_id: "studio", p_horizon: "6", p_scenario: "confirmed", p_period: "3", p_fx: [] });
    if (!unavailable) expect(rpc[1].body).toMatchObject({ p_fx: [{ currency: "USD", rate: "40", source: "nbu", effectiveDate: today }] });
    for (const call of calls.filter(c => !c.url.pathname.includes("/rpc/"))) expect(call.url.searchParams.get("studio_id")).toBe("eq.studio");
  });
});
