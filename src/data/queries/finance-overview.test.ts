import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getFinanceOverview } from "./finance-overview";
import { parseFinanceReportParams } from "@/lib/finance-overview";
const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), fx: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
const today = "2026-09-20";
const report = {
  forecast: { version: 1, asOf: today, from: "2026-09-01", through: "2027-02-28", cutover: "2026-01-01", currency: "UAH", scenario: "confirmed", horizon: "6", fx: [], cashBase: "0", cashIncomplete: false, comparisons: [], months: [], items: [], issues: [] },
  period: "3", actualFrom: "2026-07-01", upcomingThrough: "2026-10-20", historyIncomplete: false, history: [], projection: [], lowPoint: { date: today, amount: "0" }, flows: [], netFlow: "0", accounts: [], receivables: [], receivableTotal: "0", receivablesIncomplete: true, outgoingTotal: "0", outgoingIncomplete: false, categories: [], requiredCurrencies: ["USD"],
};
describe("Overview application boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "studio" }); mocks.fx.mockResolvedValue({ rate: "40", source: "nbu", effectiveDate: today }); });
  it("denies non-admins before touching the database or rates", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await getFinanceOverview(parseFinanceReportParams({}, today))).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled();
  });
  for (const mode of ["nbu", "unavailable", "manual", "database-error", "invalid-report"]) it(`resolves full report scope using shared FX policy: ${mode}`, async () => {
    if (mode === "unavailable") mocks.fx.mockRejectedValue(new Error("unavailable"));
    const calls: unknown[] = [];
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async (_input, init) => {
      calls.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
      return new Response(JSON.stringify(mode === "database-error" ? { message: "denied" } : mode === "invalid-report" ? {} : report), { status: mode === "database-error" ? 403 : 200, headers: { "Content-Type": "application/json" } });
    } } }));
    const context = parseFinanceReportParams(mode === "manual" ? { fx_USD: "41", horizon: "12", scenario: "planned", period: "year" } : {}, today);
    if (mode === "database-error" || mode === "invalid-report") { await expect(getFinanceOverview(context)).rejects.toThrow(); return; }
    expect((await getFinanceOverview(context))?.receivablesIncomplete).toBe(true);
    expect(calls).toHaveLength(mode === "unavailable" ? 1 : 2);
    expect(calls[0]).toMatchObject({ p_studio_id: "studio", p_fx: [] });
    if (mode === "manual") {
      expect(mocks.fx).not.toHaveBeenCalled();
      expect(calls[1]).toEqual({ p_studio_id: "studio", p_horizon: "12", p_scenario: "planned", p_period: "year", p_fx: [{ currency: "USD", rate: "41", source: "manual", effectiveDate: today }] });
    } else expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", today, "nbu", "");
  });
});
