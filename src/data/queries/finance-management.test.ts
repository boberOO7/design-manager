import { beforeEach, expect, it, vi } from "vitest";
import { historicalLaborPeriodSchema } from "@/lib/finance-historical-labor";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fx: vi.fn(), labor: vi.fn(), expenses: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: async () => ({ studio_id: "10000000-0000-4000-8000-000000000001" }) }));
vi.mock("./finance", () => ({ getFinanceData: async () => ({ settings: { base_currency: "UAH", recognition_start_month: null }, currencies: [{ code: "UAH", minor_units: 2 }] }) }));
vi.mock("./finance-display-currency", () => ({ getFinanceDisplayCurrency: async () => "UAH" }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFxDates: mocks.fx }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.labor }));
vi.mock("@/lib/finance-automatic-expenses", () => ({ scheduleAutomaticExpenses: mocks.expenses }));
import { getFinanceManagement } from "./finance-management";
const id = "10000000-0000-4000-8000-000000000001", project = "10000000-0000-4000-8000-000000000002";
const source = historicalLaborPeriodSchema.parse({ sourceKey: "payroll:employee:2026-09-01", obligationId: null, scheduleId: id, termsId: id, employeeId: id, label: "Salary",
  periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "USD", reportingCurrency: "UAH", knownNative: "1000", recognizedNative: "0", remainingNative: "1000",
  knownStudioCost: null, recognizedCost: "0", calculatedCost: null, unattributedCost: null, allocations: [], projectIds: [project],
  expectedMinutes: 1000, completedDays: 10, requiredDays: 20, missingDates: ["2026-09-03"], issues: ["fx_required", "missing_reports"], fx: null });
beforeEach(() => {
  vi.clearAllMocks(); mocks.fx.mockResolvedValue(new Map([["2026-09-30", "40"]]));
  mocks.rpc.mockImplementation(async (name: string, args: { p_historical_fx?: Record<string, unknown> }) => {
    const valued = Boolean(args.p_historical_fx?.["USD:2026-09-30"]);
    const historicalLabor = { asOf: "2026-10-19", reportingCurrency: "UAH", periods: [valued ? { ...source, knownStudioCost: "40000", calculatedCost: "40000", unattributedCost: "30000",
      allocations: [{ projectId: project, amount: "10000" }], fx: { rate: "40", source: "nbu", effectiveDate: "2026-09-30" }, issues: ["missing_reports"] } : source] };
    return { data: name === "get_finance_calculated_labor_reporting" ? historicalLabor : { historicalLabor, asOf: "2026-10-19", recognitionStart: null,
      months: [], entries: [], coverage: [], projects: [{ id: project, name: "Historical project", startsOn: "2026-09-01" }], sources: [],
      labor: { sources: [], pools: [], allocations: [] }, tripSources: [], projectReporting: { receipts: [], events: [], estimates: [], contracts: [], matched: [] } }, error: null };
  });
});
it("values historical inputs at period end and reads calculations with the final recognition snapshot before activation", async () => {
  const data = await getFinanceManagement({ from: "2026-09-01", to: "2026-09-30" });
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", ["2026-09-30"]);
  expect(mocks.rpc).toHaveBeenCalledWith("get_finance_management_reporting", { p_studio_id: id, p_historical_fx: { "USD:2026-09-30": { rate: "40", source: "nbu", effectiveDate: "2026-09-30" } } });
  expect(data?.settings?.recognition_start_month).toBeNull();
  expect(data?.historicalProjectLabor[0].period).toMatchObject({ known: "10000.00", incomplete: true });
  expect(data?.amountRows).toEqual([]);
  expect(data?.provisional).toEqual(expect.arrayContaining([expect.objectContaining({ classification: "labor", project_id: project, display_amount: "10000.00" }), expect.objectContaining({ project_id: null, display_amount: "30000.00" })]));
});
it("retains native cost and specific missing FX coverage without a substitute quote", async () => {
  mocks.fx.mockRejectedValue(new Error("unavailable"));
  const data = await getFinanceManagement({ from: "2026-09-01", to: "2026-09-30" });
  expect(data?.historicalLabor[0]).toMatchObject({ knownNative: "1000", calculatedCost: null });
  expect(data?.historicalProjectLabor[0].period).toMatchObject({ known: null, incomplete: true, issues: ["fx_required", "missing_reports"] });
});

it("ordinary report loads and reloads only read scoped reporting RPCs and never schedule financial workers", async () => {
  await getFinanceManagement({});
  await getFinanceManagement({});
  expect(mocks.labor).not.toHaveBeenCalled();
  expect(mocks.expenses).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "get_finance_calculated_labor_reporting", "get_finance_management_reporting",
    "get_finance_calculated_labor_reporting", "get_finance_management_reporting",
  ]);
  expect(mocks.rpc.mock.calls.every(([, args]) => args.p_studio_id === id)).toBe(true);
});

it("loads reports with piecework conditions without treating an absent monthly amount as zero", async () => {
  const historicalLabor = { asOf: "2026-10-28", reportingCurrency: "UAH", periods: [] };
  const condition = { employeeId: id, name: "Piecework employee", termId: id, effectiveFrom: "2026-10-01", effectiveThrough: null,
    currency: "USD", amount: null, basis: "net", payout: null, deductions: "0", employerCost: "0", employerStatus: "fixed" };
  const fixed = { ...condition, employeeId: project, termId: project, name: "Fixed employee", currency: "UAH", amount: "15000", payout: "15000" };
  mocks.rpc.mockResolvedValueOnce({ data: historicalLabor, error: null }).mockResolvedValueOnce({ data: {
    historicalLabor, asOf: "2026-10-28", recognitionStart: null, months: [], entries: [], coverage: [], projects: [], sources: [],
    labor: { sources: [], pools: [], allocations: [], salaryConditions: [condition, fixed] }, tripSources: [],
    projectReporting: { receipts: [], events: [], estimates: [], contracts: [], matched: [] },
  }, error: null });
  const report = await getFinanceManagement({});
  expect(report?.labor.salaryConditions).toEqual([condition, fixed]);
  expect(mocks.labor).not.toHaveBeenCalled();
});
