import { describe, expect, it } from "vitest";
import { buildFinanceAnalytics, financeAnalyticsPeriod, financeOverviewCashRisk } from "./finance-analytics";
import { laborDataSchema } from "./finance-labor";
import { buildProjectProfitability, projectReportingSchema } from "./finance-profitability";
import { summarizeManagementEntries, type ManagementAmountRow, type ReportCoverage } from "./finance-management";

const today = "2026-10-06";
const currency = { code: "UAH", name: "Hryvnia", symbol: "₴", minor_units: 2, is_active: true };
const row = (classification: ManagementAmountRow["classification"], amount: string | null, date = "2026-10-02"): ManagementAmountRow => ({ id: `${classification}-${date}`, source_entry_id: "source", allocation_id: null, project_id: null, classification, recognized_on: date, display_amount: amount });
const coverage = (month = "2026-10-01"): ReportCoverage => ({ id: "coverage", project_id: null, month, reviewed_through: month === "2026-10-01" ? today : "2026-09-30", revision: 1, revenue_reviewed: true, direct_costs_reviewed: true, labor_reviewed: true, overhead_reviewed: true, changed_since_review: false });
const emptyLabor = () => laborDataSchema.parse({ sources: [], pools: [], allocations: [] });
function input(overrides: Partial<Parameters<typeof buildFinanceAnalytics>[0]> = {}) {
  return { amountRows: [], entries: [], coverage: [coverage(), ...(overrides.projectProfitability ?? []).map(p => ({ ...coverage(), project_id: p.projectId }))], labor: emptyLabor(), tripSources: [], projectProfitability: [],
    settings: { recognition_start_month: "2026-10-01" }, currency, today, ...overrides };
}
function project(name: string, result: string, overrides: Partial<ReturnType<typeof buildProjectProfitability>[number]> = {}) {
  const generated = buildProjectProfitability({ projects: [{ id: name, name, startsOn: "2026-10-01" }], entries: [], projectRows: [],
    labor: emptyLabor(), coverage: [{ ...coverage(), project_id: name }], reporting: projectReportingSchema.parse({ receipts: [], events: [], estimates: [], contracts: [], matched: [] }),
    cash: [], from: "2026-10-01", to: today, start: "2026-10-01", today, currency: "UAH", digits: 2, baseDigits: 2, rates: new Map(), referenceRates: new Map() })[0];
  return { ...generated, period: { ...generated.period, result, revenue: "100", margin: "50" }, ...overrides };
}
describe("Finance Overview presentation", () => {
  it("uses three calendar months and preserves Kyiv date-only period boundaries", () => {
    expect(financeAnalyticsPeriod("3", "2026-01-06")).toEqual({ from: "2025-11-01", to: "2026-01-06" });
    expect(financeAnalyticsPeriod("month", today)).toEqual({ from: "2026-10-01", to: today });
    expect(financeAnalyticsPeriod("year", today)).toEqual({ from: "2026-01-01", to: today });
  });
  it("matches canonical P&L including signed economic corrections", () => {
    const rows = [row("revenue", "120.01"), row("revenue", "-20.01", "2026-10-03"), row("direct_cost", "30"), row("labor", "15"), row("overhead", "-5")];
    const result = buildFinanceAnalytics(input({ amountRows: rows }), "2026-10-01", today);
    expect(result.result).toEqual({ amount: summarizeManagementEntries(rows, "2026-10-01", today, 2).knownResult, incomplete: false });
    expect(result.costs.amount).toBe("40.00"); expect(result.revenue.amount).toBe("100.00");
    expect(result.months[0].result.amount).toBe("60.00");
  });
  it("never uses an unknown FX amount or unreviewed zero as a complete zero", () => {
    const result = buildFinanceAnalytics(input({ amountRows: [row("revenue", null), row("direct_cost", "20")] }), "2026-10-01", today);
    expect(result.revenue).toMatchObject({ amount: null, incomplete: true });
    expect(result.result).toMatchObject({ amount: "-20.00", incomplete: true });
    expect(buildFinanceAnalytics(input({ coverage: [] }), "2026-10-01", today).costs.amount).toBeNull();
    expect(buildFinanceAnalytics(input(), "2026-10-01", today).result).toEqual({ amount: "0.00", incomplete: false });
  });
  it("leaves pre-activation months unavailable, including a partially covered selection", () => {
    const result = buildFinanceAnalytics(input({ amountRows: [row("revenue", "100")] }), "2026-08-01", today);
    expect(result.months.map(m => m.result.amount)).toEqual([null, null, "100.00"]);
    expect(result.result.incomplete).toBe(true); expect(result.effectiveFrom).toBe("2026-10-01");
    expect(buildFinanceAnalytics(input({ settings: null }), "2026-10-01", today).result.amount).toBeNull();
  });
  it("keeps open payroll separate from known-zero extra components", () => {
    const labor = emptyLabor(); labor.sources.push({ obligationId: "id", employeeId: "id", label: "Employee", kind: "payroll", periodStart: "2026-10-01", periodEnd: "2026-10-31", currency: "UAH", knownCost: "100", recognizedCost: "0", remainingCost: "100", deductionsStatus: "fixed", employerStatus: "fixed", basis: "net", version: "0".repeat(32), snapshot: {}, sourceReady: true, canConfirm: false });
    const result = buildFinanceAnalytics(input({ labor }), "2026-10-01", today);
    expect(result.expenses.find(e => e.key === "labor")).toMatchObject({ amount: null, incomplete: true });
    expect(result.revenue.incomplete).toBe(false);
    labor.sources[0] = { ...labor.sources[0], remainingCost: "0", recognizedCost: "100", canConfirm: true };
    expect(buildFinanceAnalytics(input({ labor, amountRows: [row("labor", "100")] }), "2026-10-01", today).costs.incomplete).toBe(false);
  });
  it("keeps pending trips and missing payroll periods incomplete", () => {
    const labor = emptyLabor(); labor.missingPeriods.push({ scheduleId: "id", label: "Employee", periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    const trip = { date: "2026-10-02", projectId: null };
    const result = buildFinanceAnalytics(input({ labor, tripSources: [trip] }), "2026-10-01", today);
    expect(result.expenses.filter(e => e.incomplete).map(e => e.key)).toEqual(["direct_cost", "labor"]);
  });
  it("ranks exact complete results and separates incomplete projects without a margin", () => {
    const rows = [project("A", "9007199254740993.01"), project("B", "9007199254740993.02"), project("Unknown", "9999999999999999", { coverageGaps: 1 }), project("Zero", "0")];
    const result = buildFinanceAnalytics(input({ projectProfitability: rows, coverage: [coverage(), ...rows.map(p => ({ ...coverage(), project_id: p.projectId, revenue_reviewed: p.projectId !== "Unknown" }))] }), "2026-10-01", today);
    expect(result.completeProjects.map(p => p.id)).toEqual(["B", "A", "Zero"]);
    expect(result.incompleteProjects[0]).toMatchObject({ id: "Unknown", margin: null, result: { incomplete: true } });
    expect(buildFinanceAnalytics(input({ projectProfitability: [project("No history", "0")] }), "2026-09-01", today).incompleteProjects[0].result.amount).toBeNull();
  });
  it("does not certify project ranks while labor awaits attribution", () => {
    const labor = emptyLabor(); labor.pools.push({ id: "pool", obligation_id: "obligation", employee_id: "employee", description: "Salary", period_start: "2026-10-01", period_end: "2026-10-31", recognized_on: "2026-10-31", currency: "UAH", amount: "100", reporting_currency: "UAH", available_reporting_amount: "100", allocated_amount: "0", allocation_revision: 0, fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-10-31" });
    const result = buildFinanceAnalytics(input({ labor, amountRows: [{ ...row("labor", "100"), source_entry_id: "pool" }], projectProfitability: [project("A", "100")] }), "2026-10-01", today);
    expect(result.completeProjects).toHaveLength(0); expect(result.unallocatedLabor).toBe(true);
    const older = buildFinanceAnalytics(input({ labor, projectProfitability: [project("Legacy project", "100", { historyIncomplete: true, laborIncomplete: true, pendingTripCount: 1 })] }), "2026-10-01", today);
    expect(older.completeProjects).toHaveLength(1); expect(older.unallocatedLabor).toBe(false);
  });
  it("detects the first canonical cash deficit and does not confirm absence with missing data", () => {
    const data = { forecast: { asOf: today, cashBase: "100", cashIncomplete: false, issues: [] }, projection: [{ date: "2026-10-09", amount: "-0.0001" }, { date: "2026-10-07", amount: "20" }] };
    expect(financeOverviewCashRisk(data)).toEqual({ incomplete: false, firstDeficit: "2026-10-09" });
    expect(financeOverviewCashRisk({ ...data, forecast: { ...data.forecast, cashIncomplete: true } })).toEqual({ incomplete: true, firstDeficit: null });
    expect(financeOverviewCashRisk({ ...data, projection: [] })).toEqual({ incomplete: false, firstDeficit: null });
  });
});
