import { describe, expect, it } from "vitest";
import { buildProjectProfitability, estimateDisplayAmounts, projectAmountRows, projectCashDisplayEvents, proportionalAmount, projectCostEstimateInputSchema } from "./finance-profitability";
import { managementAmountRows, managementDisplayEntries, type RecognitionEntry, type ReportCoverage } from "./finance-management";
import { laborDataSchema } from "./finance-labor";
import type { ProjectCostEstimate, ProjectReporting } from "./finance-profitability";
const id = "62000000-0000-4000-8000-000000000001";
const project2 = "62000000-0000-4000-8000-000000000002";
const entry2 = "62000000-0000-4000-8000-000000000003";
const entry3 = "62000000-0000-4000-8000-000000000004";
const categoryId = "62000000-0000-4000-8000-000000000005";

function recognition(overrides: Partial<RecognitionEntry> = {}): RecognitionEntry {
  return { id: entry2, kind: "recognition", classification: "revenue", source_kind: "movement", terms_id: null,
    expected_item_id: null, movement_id: null, trip_entry_id: null, obligation_id: null, employee_id: null, project_id: id, category_id: categoryId, source_snapshot: {},
    period_start: "2026-09-01", period_end: "2026-09-30", recognized_on: "2026-09-15", description: "Revenue",
    currency: "USD", amount: "100.00", vat_amount: "0.00", gross_amount: "100.00", reporting_currency: "USD",
    reporting_amount: "100.00", fx_rate: null, fx_source: null, fx_effective_date: null, related_entry_id: null,
    reason: "", created_at: "2026-09-15T12:00:00Z", ...overrides };
}

const labor = () => laborDataSchema.parse({ sources: [], pools: [], allocations: [] });
function estimate(overrides: Partial<ProjectCostEstimate> = {}): ProjectCostEstimate {
  return { id: entry3, project_id: id, revision: 1, currency: "USD", as_of: "2026-10-04", direct_budget: "100.00", labor_budget: "50.00",
    remaining_direct: "20.00", remaining_labor: "10.00", reporting_currency: "USD", fx_rate: "1", fx_source: "identity",
    fx_effective_date: "2026-10-04", source_digest: "reviewed", reason: "Reviewed", created_at: "2026-10-04T12:00:00Z", ...overrides };
}
function coverage(month: string): ReportCoverage {
  return { id: entry3, project_id: id, month, reviewed_through: month === "2026-10-01" ? "2026-10-04" : "2026-09-30", revision: 1,
    revenue_reviewed: true, direct_costs_reviewed: true, labor_reviewed: true, overhead_reviewed: true, changed_since_review: false };
}
function profitabilityInput(overrides: Partial<Parameters<typeof buildProjectProfitability>[0]> = {}) {
  const contract: ProjectReporting["contracts"][number] = { id: entry3, project_id: id, stream: "main", mode: "design", currency: "USD",
    net_amount: "200.00", gross_amount: "240.00", effective_from: "2026-09-01" };
  const report: ProjectReporting = { receipts: [], events: [], estimates: [estimate()], contracts: [contract], matched: [],
    costStates: [{ projectId: id, digest: "reviewed", latestDate: "2026-10-04" }], cashHistory: [] };
  return { projects: [{ id, name: "Project", startsOn: "2026-09-01" }], entries: [] as ReturnType<typeof managementDisplayEntries>,
    projectRows: [], labor: labor(), coverage: [coverage("2026-09-01"), coverage("2026-10-01")], reporting: report, cash: [],
    from: "2026-10-01", to: "2026-10-04", start: "2026-09-01", today: "2026-10-04", currency: "USD", digits: 2, baseDigits: 2,
    rates: new Map<string, string>(), referenceRates: new Map<string, string>(), ...overrides };
}

describe("project amounts", () => {
  it("rounds cumulative shares exactly, including negative events", () => {
    expect(proportionalAmount("0.01", BigInt(1), BigInt(2), 2)).toBe("0.01");
    expect(proportionalAmount("0.01", -BigInt(1), BigInt(2), 2)).toBe("-0.01");
  });
  it("keeps a refund negative even though its ledger valuation is signed", () => {
    const event = { movement_id:id, project_id:id, amount:"-200", financial_date:"2026-10-04", currency:"UAH",reporting_currency:"UAH",
      source_reporting_amount:"-200",source_amount:"200",fx_rate:"1",fx_source:"identity",fx_effective_date:"2026-10-04",revision:0,reason:"Refund" };
    expect(projectCashDisplayEvents([event],"UAH",2,new Map())[0].display_amount).toBe("-200.00");
    expect(projectCashDisplayEvents([{...event,source_reporting_amount:null}],"UAH",2,new Map())[0].display_amount).toBeNull();
  });
  it("separates unknown estimates from explicitly zero and preserves historical estimate FX", () => {
    const input = {requestId:id,projectId:id,revision:0,currency:"USD",date:"2026-10-04",directBudget:"",laborBudget:"0",remainingDirect:"",remainingLabor:"0",reason:"Reviewed"};
    expect(projectCostEstimateInputSchema.parse(input)).toMatchObject({directBudget:null,laborBudget:"0",remainingDirect:null,remainingLabor:"0"});
    expect(estimateDisplayAmounts(null,"USD",2,2,new Map())).toEqual({direct_budget:null,labor_budget:null,remaining_direct:null,remaining_labor:null});
  });

  it("allocates a labor pool and its later economic contra across the same projects", () => {
    const poolId = entry2;
    const rows = managementDisplayEntries([
      recognition({ id: poolId, classification: "labor", project_id: null, recognized_on: "2026-09-30", reporting_amount: "100.00" }),
      recognition({ id: entry3, kind: "adjustment", classification: "labor", project_id: null, related_entry_id: poolId, recognized_on: "2026-10-02", reporting_amount: "-25.00" }),
    ], "USD", 2, new Map());
    const laborData = laborDataSchema.parse({ sources: [], missingPeriods: [],
      pools: [{ id: poolId, obligation_id: entry3, employee_id: entry3, description: "Payroll", period_start: "2026-09-01", period_end: "2026-09-30", recognized_on: "2026-09-30",
        currency: "USD", amount: "100.00", reporting_currency: "USD", available_reporting_amount: "75.00", allocated_amount: "60.00", allocation_revision: 1, fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-09-30" }],
      allocations: [{ entry_id: poolId, project_id: id, amount: "40.00", revision: 1, reason: "Split", created_at: "2026-09-30T12:00:00Z" },
        { entry_id: poolId, project_id: project2, amount: "20.00", revision: 1, reason: "Split", created_at: "2026-09-30T12:00:00Z" }] });

    expect(projectAmountRows(rows, laborData, 2).map(row => [row.project_id, row.recognized_on, row.display_amount])).toEqual([
      [id, "2026-09-30", "53.33"], [project2, "2026-09-30", "26.67"], [id, "2026-10-02", "-13.33"], [project2, "2026-10-02", "-6.67"],
    ]);
  });

  it("uses cumulative minor-unit rounding and leaves an exact unallocated bridge", () => {
    const event = (project_id: string) => ({ movement_id: entry2, project_id, amount: "1.00", financial_date: "2026-10-04", currency: "USD", reporting_currency: "UAH",
      source_reporting_amount: "1.00", source_amount: "3.00", fx_rate: "40", fx_source: "nbu", fx_effective_date: "2026-10-04", revision: 0, reason: "Receipt" });
    const displayed = projectCashDisplayEvents([event(id), event(project2)], "UAH", 2, new Map());
    const attributed = displayed.reduce((sum, row) => sum + Number(row.display_amount), 0);
    const unallocatedBridge = proportionalAmount("1.00", BigInt(1), BigInt(3), 2);
    expect(displayed.map(row => row.display_amount)).toEqual(["0.33", "0.34"]);
    expect(attributed + Number(unallocatedBridge)).toBe(1);
  });

  it("keeps project economic totals, trip subset and period bounds separate", () => {
    const rows = managementDisplayEntries([
      recognition({ id: entry2, source_kind:"project_terms", recognized_on: "2026-09-15", reporting_amount: "100.00" }),
      recognition({ id: entry3, source_kind:"project_terms", classification: "revenue", recognized_on: "2026-10-02", period_start: "2026-10-01", period_end: "2026-10-31", amount: "50.00", gross_amount: "50.00", reporting_amount: "50.00" }),
      recognition({ id: "62000000-0000-4000-8000-000000000006", classification: "direct_cost", recognized_on: "2026-10-03", trip_entry_id: "62000000-0000-4000-8000-000000000007", amount: "20.00", gross_amount: "20.00", reporting_amount: "20.00" }),
      recognition({ id: "62000000-0000-4000-8000-000000000008", classification: "labor", project_id: null, recognized_on: "2026-10-03", amount: "10.00", gross_amount: "10.00", reporting_amount: "10.00" }),
    ], "USD", 2, new Map());
    const laborData = laborDataSchema.parse({ sources: [], missingPeriods: [],
      pools: [{ id: "62000000-0000-4000-8000-000000000008", obligation_id: entry3, employee_id: entry3, description: "Payroll", period_start: "2026-10-01", period_end: "2026-10-31", recognized_on: "2026-10-03",
        currency: "USD", amount: "10.00", reporting_currency: "USD", available_reporting_amount: "10.00", allocated_amount: "10.00", allocation_revision: 1, fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-10-03" }],
      allocations: [{ entry_id: "62000000-0000-4000-8000-000000000008", project_id: id, amount: "10.00", revision: 1, reason: "Split", created_at: "2026-10-03T12:00:00Z" }] });
    const input = profitabilityInput({ entries: rows, labor: laborData, projectRows: projectAmountRows(rows, laborData, 2) });
    expect(buildProjectProfitability(input)[0]).toMatchObject({
      period: { revenue: "50.00", directCost: "20.00", labor: "10.00", tripCost: "20.00", result: "20.00" },
      lifetime: { revenue: "150.00", directCost: "20.00", labor: "10.00", result: "120.00" },
      finalMargin: "70.00",
    });
  });

  it("requires known remaining costs, complete history and coverage for a final margin", () => {
    const base = profitabilityInput();
    const result = (overrides: Partial<Parameters<typeof buildProjectProfitability>[0]>) => buildProjectProfitability({ ...base, ...overrides })[0];
    expect(result({}).finalMargin).toBe("85.00");
    expect(result({ reporting: { ...base.reporting, estimates: [estimate({ remaining_direct: null })] } }).finalMargin).toBeNull();
    expect(result({ start: null }).finalMargin).toBeNull();
    expect(result({ coverage: [] }).finalMargin).toBeNull();
    expect(result({ reporting: { ...base.reporting, contracts: [{ ...base.reporting.contracts[0], mode: "monthly_supervision" }] } }).agreed.net).toBeNull();
  });

  it("marks estimates stale when the fingerprint is absent, changed, or behind new costs", () => {
    const base = profitabilityInput();
    const result = (reporting: ProjectReporting) => buildProjectProfitability({ ...base, reporting })[0];
    expect(result({ ...base.reporting, estimates: [estimate({ source_digest: null })] })).toMatchObject({ estimateStale: true, finalMargin: null });
    expect(result({ ...base.reporting, estimates: [estimate({ source_digest: "older" })] })).toMatchObject({ estimateStale: true, finalMargin: null });
    expect(result({ ...base.reporting, costStates: [{ projectId: id, digest: "reviewed", latestDate: "2026-10-05" }] }))
      .toMatchObject({ estimateStale: true, finalMargin: null });
    expect(result(base.reporting)).toMatchObject({ estimateStale: false, finalMargin: "85.00" });
  });

  it("keeps final margin provisional when new facts invalidate reviewed period coverage", () => {
    const base = profitabilityInput();
    const coverageRows = [coverage("2026-09-01"), { ...coverage("2026-10-01"), direct_costs_reviewed: false, changed_since_review: true }];
    expect(buildProjectProfitability({ ...base, coverage: coverageRows })[0]).toMatchObject({ coverageGaps: 1, finalMargin: null });
  });

  it("keeps historical revenue FX while converting only the remaining design contract", () => {
    const rows = managementDisplayEntries([
      recognition({ id: entry2, source_kind: "project_terms", currency: "USD", amount: "50.00", reporting_currency: "UAH", reporting_amount: "100.00",
        fx_rate: "2", fx_source: "nbu", fx_effective_date: "2026-09-15", recognized_on: "2026-09-15" }),
      recognition({ id: entry3, classification: "direct_cost", currency: "UAH", amount: "50.00", reporting_currency: "UAH", reporting_amount: "50.00",
        recognized_on: "2026-09-20" }),
    ], "UAH", 2, new Map());
    const base = profitabilityInput();
    const contract = { ...base.reporting.contracts[0], currency: "USD", net_amount: "100.00", gross_amount: "100.00" };
    const result = buildProjectProfitability(profitabilityInput({ entries: rows, projectRows: managementAmountRows(rows), currency: "UAH",
      reporting: { ...base.reporting, estimates: [estimate({ currency: "UAH", reporting_currency: "UAH", remaining_direct: "0.00", remaining_labor: "0.00" })], contracts: [contract] },
      referenceRates: new Map([["USD", "3"]]) }))[0];

    expect(result).toMatchObject({ lifetime: { revenue: "100.00", directCost: "50.00" }, agreed: { net: "300.00" }, finalMargin: "80.00" });
  });

  it("propagates unresolved historical FX into profitability and received totals", () => {
    const rows = managementDisplayEntries([recognition({ recognized_on: "2026-10-03", period_start: "2026-10-01", period_end: "2026-10-31", reporting_amount: null })], "UAH", 2, new Map());
    const cash = projectCashDisplayEvents([{ movement_id: entry2, project_id: id, amount: "100.00", financial_date: "2026-10-03", currency: "USD", reporting_currency: "UAH",
      source_reporting_amount: null, source_amount: "100.00", fx_rate: null, fx_source: null, fx_effective_date: "2026-10-03", revision: 0, reason: "Receipt" }], "UAH", 2, new Map());
    const result = buildProjectProfitability(profitabilityInput({ entries: rows, projectRows: projectAmountRows(rows, labor(), 2), cash }))[0];
    expect(result.period).toMatchObject({ revenue: "0.00", missingFx: 1 });
    expect(result.received.period).toBeNull();
    expect(result.received.lifetime).toBeNull();
  });

  it("aggregates confirmed orders and excludes drafts from the agreed project value", () => {
    const base = profitabilityInput();
    const contracts = [
      { ...base.reporting.contracts[0], order_id: entry2, order_status: "confirmed" as const },
      { ...base.reporting.contracts[0], id: project2, order_id: project2, order_status: "confirmed" as const, net_amount: "100.00", gross_amount: "120.00" },
      { ...base.reporting.contracts[0], id: categoryId, order_id: categoryId, order_status: "draft" as const, net_amount: "500.00", gross_amount: "600.00" },
    ];
    const rows = managementDisplayEntries([
      recognition({ source_kind: "project_terms", order_id: entry2, amount: "150.00", reporting_amount: "150.00" }),
      recognition({ id: entry3, source_kind: "expected", order_id: project2, source_snapshot: { stream: "design" }, amount: "20.00", reporting_amount: "20.00" }),
    ], "USD", 2, new Map());
    expect(buildProjectProfitability({ ...base, entries: rows, projectRows: managementAmountRows(rows), reporting: { ...base.reporting, contracts } })[0])
      .toMatchObject({ agreed: { net: "300.00", gross: "360.00", complete: true }, lifetime: { revenue: "170.00" }, finalMargin: "90.00" });
  });

  it("subtracts recognized native revenue by order before converting its remainder", () => {
    const base = profitabilityInput();
    const contracts = [
      { ...base.reporting.contracts[0], order_id: entry2, currency: "USD", net_amount: "100.00", gross_amount: "100.00" },
      { ...base.reporting.contracts[0], id: project2, order_id: project2, currency: "EUR", net_amount: "200.00", gross_amount: "200.00" },
    ];
    const rows = managementDisplayEntries([
      recognition({ source_kind: "project_terms", order_id: entry2, amount: "50.00", reporting_currency: "UAH", reporting_amount: "100.00", fx_rate: "2" }),
      recognition({ id: entry3, source_kind: "expected", order_id: project2, source_snapshot: { stream: "design" }, currency: "EUR", amount: "100.00", reporting_currency: "UAH", reporting_amount: "200.00", fx_rate: "2" }),
      recognition({ id: categoryId, classification: "direct_cost", currency: "UAH", amount: "50.00", reporting_currency: "UAH", reporting_amount: "50.00" }),
    ], "UAH", 2, new Map());
    const input = { ...base, entries: rows, projectRows: managementAmountRows(rows), currency: "UAH", referenceRates: new Map([["USD", "3"], ["EUR", "5"]]),
      reporting: { ...base.reporting, contracts, estimates: [estimate({ currency: "UAH", reporting_currency: "UAH", remaining_direct: "0", remaining_labor: "0" })] } };
    expect(buildProjectProfitability(input)[0]).toMatchObject({ agreed: { net: "1300.00", complete: true }, lifetime: { revenue: "300.00" }, finalMargin: "94.74" });
    expect(buildProjectProfitability({ ...input, referenceRates: new Map([["USD", "3"]]) })[0])
      .toMatchObject({ agreed: { net: null }, finalMargin: null });
  });

  it("retains order ownership through native economic adjustments without borrowing another order's allowance", () => {
    const base = profitabilityInput();
    const contracts = [
      { ...base.reporting.contracts[0], order_id: entry2, net_amount: "100.00" },
      { ...base.reporting.contracts[0], id: project2, order_id: project2, net_amount: "200.00" },
    ];
    const rows = managementDisplayEntries([
      recognition({ source_kind: "project_terms", order_id: entry2, amount: "110.00", reporting_amount: "110.00" }),
      recognition({ id: entry3, kind: "adjustment", related_entry_id: entry2, source_kind: "project_terms", order_id: entry2, amount: "-20.00", reporting_amount: "-20.00" }),
    ], "USD", 2, new Map());
    const input = { ...base, entries: rows, projectRows: managementAmountRows(rows), reporting: { ...base.reporting, contracts } };
    expect(buildProjectProfitability(input)[0].finalMargin).toBe("90.00");
    expect(buildProjectProfitability({ ...input, entries: rows.slice(0, 1), projectRows: managementAmountRows(rows.slice(0, 1)) })[0].finalMargin).toBeNull();
    expect(buildProjectProfitability({ ...input, entries: rows.map(row => ({ ...row, order_id: null })) })[0])
      .toMatchObject({ agreed: { complete: false }, finalMargin: null });
  });
});
