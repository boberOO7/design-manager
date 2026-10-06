import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getDashboardOperations } from "./dashboard-operations";

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("./crm", () => ({ getActiveCrmLeadCount: async () => 3 }));
vi.mock("./finance-display-currency", () => ({ getFinanceDisplayCurrency: async () => "UAH" }));

const today = "2026-10-03";
const now = new Date(`${today}T10:00:00Z`);
const report = {
  forecast: { version: 1, asOf: today, from: "2026-10-01", through: "2026-12-31", cutover: "2026-01-01", currency: "UAH", scenario: "confirmed", horizon: "3", fx: [], cashBase: "0", cashIncomplete: false, comparisons: [], months: [], items: [], issues: [] },
  period: "month", actualFrom: "2026-10-01", upcomingThrough: "2026-11-02", historyIncomplete: false, history: [], projection: [], lowPoint: { date: today, amount: "0" }, flows: [{ month: "2026-10-01", nature: "operating", direction: "incoming", amount: "100.00" }], netFlow: "100.00", accounts: [], receivables: [], receivableTotal: "0", receivablesIncomplete: false, outgoingTotal: "0", outgoingIncomplete: false, categories: [], requiredCurrencies: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "studio", authenticatedUserId: "admin" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function setup(mode: "success" | "reset" | "sql" | "invalid" | "settings" | "draft" | "vat" | "crm") {
  const fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    const headers = new Headers({ "Content-Type": "application/json", "Content-Range": "0-0/1" });
    if (table === "get_finance_overview" && mode === "reset") return new Response(JSON.stringify({ message: "An invalid response was received from the upstream server" }), { status: 502, headers });
    if (table === "get_finance_overview" && mode === "sql") return new Response(JSON.stringify({ code: "42P01", message: "relation missing" }), { status: 500, headers });
    if ((table === "finance_settings" && mode === "settings") || (table === "finance_project_vat_actuals" && mode === "vat") || (table === "crm_leads" && mode === "crm")) return new Response(JSON.stringify({ code: "42501", message: "denied" }), { status: 403, headers });
    if (init?.method === "HEAD") return new Response(null, { headers });
    const body = table === "finance_settings" ? { finalized_at: mode === "draft" ? null : today }
      : table === "get_finance_overview" ? mode === "invalid" ? {} : report
      : table === "finance_currencies" ? { minor_units: 2 }
      : table === "finance_project_vat_actuals" ? [{ financial_date: today, vat_reporting_amount: "20.00" }]
      : table === "crm_leads" ? [{ id: "lead", client_name: "Client", next_contact_at: `${today}T09:00:00Z` }]
      : table === "office_assignments" ? [{ id: "assignment", title: "Office work", deadline: "2026-10-02", priority: "urgent", status: "in_progress", responsible_id: "admin" }]
      : table === "equipment" ? [{ id: "equipment", display_name: "PC", asset_tag: "PC-1", recurring_maintenance_enabled: true, next_maintenance_due_date: "2026-10-02", lifecycle_state: "active" }]
      : table === "submissions" ? [{ id: "submission", type: "request", status: "new" }]
      : [];
    return new Response(JSON.stringify(body), { headers });
  });
  mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch } }));
  return fetch;
}

it.each(["reset", "sql", "invalid", "settings", "vat"] as const)("preserves non-finance dashboard data when Finance fails: %s", async (mode) => {
  const fetch = setup(mode);
  const result = await getDashboardOperations(today, now);
  expect(result).toMatchObject({
    finance: null,
    financeUnavailable: true,
    crm: { activeCount: 3, overdueCount: 1 },
    office: { overdueAssignmentCount: 1, myAssignments: [{ id: "assignment" }] },
    equipment: { overdueCount: 1 },
    submissions: { urgentCount: 1 },
  });
  const rpcCalls = fetch.mock.calls.filter(([input]) => String(input).includes("get_finance_overview"));
  expect(rpcCalls).toHaveLength(mode === "reset" ? 4 : mode === "settings" ? 0 : 1);
  expect(console.error).toHaveBeenCalledWith("Dashboard Finance data is unavailable.", expect.any(Error));
});

it("retains successful Finance calculations and requests the overview only once when no FX is needed", async () => {
  const fetch = setup("success");
  const result = await getDashboardOperations(today, now);
  expect(result).toMatchObject({ financeUnavailable: false, finance: {
    overdueReceivableCount: 1, overdueObligationCount: 1, upcoming: [],
    month: { currency: "UAH", expectedInflow: "0.0000", profitAndLoss: "80.0000" },
  } });
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("get_finance_overview"))).toHaveLength(1);
  expect(console.error).not.toHaveBeenCalled();
});

it("distinguishes unfinished Finance setup from unavailable Finance", async () => {
  const fetch = setup("draft");
  expect(await getDashboardOperations(today, now)).toMatchObject({ finance: null, financeUnavailable: false });
  expect(fetch.mock.calls.some(([input]) => String(input).includes("get_finance_overview"))).toBe(false);
  expect(console.error).not.toHaveBeenCalled();
});

it("keeps unrelated operational errors outside the Finance fallback", async () => {
  setup("crm");
  await expect(getDashboardOperations(today, now)).rejects.toThrow("Unable to load Dashboard operational signals.");
  expect(console.error).not.toHaveBeenCalled();
});

it("does not request admin operations for an employee", async () => {
  mocks.admin.mockResolvedValue(null);
  expect(await getDashboardOperations(today, now)).toBeNull();
  expect(mocks.client).not.toHaveBeenCalled();
});
