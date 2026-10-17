import { describe, expect, it } from "vitest";
import { buildOverviewProjectEconomics } from "./finance-overview-economics";
import { buildProjectProfitability, projectAmountRows, projectReportingSchema } from "./finance-profitability";
import { managementDisplayEntries, recognitionEntrySchema, reportCoverageSchema } from "./finance-management";
import { laborDataSchema } from "./finance-labor";

const uuid = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = "2026-10-17";
const projectId = uuid(1), otherId = uuid(2);
function project(overrides: Partial<Parameters<typeof buildProjectProfitability>[0]> = {}) {
  const reporting = projectReportingSchema.parse({ receipts: [], events: [], matched: [],
    contracts: [{ id: uuid(3), project_id: projectId, stream: "main", mode: "design", currency: "USD", order_id: uuid(4), order_status: "confirmed", net_amount: "1000.00", gross_amount: "1200.00", effective_from: "2026-10-01" }],
    estimates: [{ id: uuid(5), project_id: projectId, revision: 1, currency: "USD", as_of: today,
      direct_budget: null, labor_budget: null, remaining_direct: "0.00", remaining_labor: "0.00", reporting_currency: "USD", fx_rate: "1", fx_source: "identity", fx_effective_date: today, source_digest: "reviewed", reason: "Final costs reviewed", created_at: `${today}T12:00:00Z` }],
    costStates: [{ projectId, digest: "reviewed", latestDate: today }],
  });
  const labor = laborDataSchema.parse({ sources: [], pools: [], allocations: [] });
  const entries = managementDisplayEntries([recognitionEntrySchema.parse({ id: uuid(6), kind: "recognition", classification: "direct_cost", source_kind: "movement", terms_id: null, expected_item_id: null, movement_id: uuid(7), obligation_id: null, employee_id: null, project_id: projectId, category_id: uuid(8), source_snapshot: {}, period_start: "2026-10-01", period_end: "2026-10-31", recognized_on: today, description: "Direct project expense", currency: "EUR", amount: "100.00", vat_amount: "20.00", gross_amount: "120.00", reporting_currency: "USD", reporting_amount: "400.00", fx_rate: "4", fx_source: "manual", fx_effective_date: today, related_entry_id: null, reason: "", created_at: `${today}T12:00:00Z` })], "USD", 2, new Map());
  const input = { projects: [{ id: projectId, name: "Completed project", startsOn: "2026-10-01" }], entries, projectRows: projectAmountRows(entries, labor, 2), labor,
    coverage: [reportCoverageSchema.parse({ id: uuid(9), project_id: projectId, month: "2026-10-01", reviewed_through: today, revision: 1, revenue_reviewed: true, direct_costs_reviewed: true, labor_reviewed: true, overhead_reviewed: true, changed_since_review: false })],
    reporting, cash: [], from: "2026-10-01", to: today, start: "2026-10-01", today, currency: "USD", digits: 2, baseDigits: 2, rates: new Map<string, string>(), referenceRates: new Map<string, string>(), ...overrides };
  return { input, result: buildProjectProfitability(input)[0] };
}
const completed = (id = projectId, area: string | null = "100.00") => ({ id, status: "completed", area });

describe("Overview project economics", () => {
  it("uses confirmed multi-order net contract values, excludes drafts and preserves historical cost valuations", () => {
    const { input } = project();
    const contracts = [input.reporting.contracts[0],
      { ...input.reporting.contracts[0], id: uuid(10), order_id: uuid(11), currency: "EUR", net_amount: "500.00", gross_amount: "600.00" },
      { ...input.reporting.contracts[0], id: uuid(12), order_id: uuid(13), order_status: "draft" as const, net_amount: "999999.00" }];
    const row = project({ reporting: { ...input.reporting, contracts }, referenceRates: new Map([["EUR", "2"]]) }).result;
    const result = buildOverviewProjectEconomics([row], [completed()], null, 2);
    expect(result.averageContract).toBe("2000.00");
    expect(result.projects[0]).toMatchObject({ contract: "2000.00", costs: "400.00", contribution: "1600.00", margin: "80.00" });
    expect(result.contractPerArea).toBe("20.00");
    // Current contract FX never restates the direct expense's stored USD valuation.
    expect(result.contributionPerArea).toBe("16.00");
  });

  it("weights portfolio margin and per-area values over their own eligible populations", () => {
    const { result: first } = project();
    const second = { ...first, projectId: otherId, name: "Larger project", agreed: { ...first.agreed, net: "3000.00" }, lifetime: { ...first.lifetime, directCost: "1000.00" } };
    const result = buildOverviewProjectEconomics([first, second], [completed(), completed(otherId, "500.00")], null, 2);
    expect(result).toMatchObject({ averageContract: "2000.00", averageMargin: "65.00", contractPerArea: "6.67", contributionPerArea: "4.33" });
    expect(result.highlights).toMatchObject({ mostExpensive: { id: otherId }, leastExpensive: { id: projectId }, highestMargin: { id: otherId }, lowestMargin: { id: projectId } });
  });

  it("keeps active contract pricing provisional, excludes internal projects and invalid areas from per-area metrics", () => {
    const { result: first } = project();
    const second = { ...first, projectId: otherId };
    const active = { ...first, projectId: uuid(14) };
    const result = buildOverviewProjectEconomics([first, second, active], [completed(projectId, "0"), completed(otherId, null), { ...completed(uuid(14)), status: "active" }], otherId, 2);
    expect(result.counts).toEqual({ completed: 1, priced: 2, costed: 1, withArea: 1, costedWithArea: 0 });
    expect(result.projects.find(project => project.id === uuid(14))).toMatchObject({ completed: false, costs: null, contribution: null, margin: null });
    expect(result.averageContract).toBe("1000.00");
    expect(result.contractPerArea).toBe("10.00");
    expect(result.contributionPerArea).toBeNull();
    expect(result.highlights.mostExpensive?.id).toBe(projectId);
  });

  it("never invents zero costs or margins for incomplete, stale, unallocated or still-provisional projects", () => {
    const { input } = project();
    const incomplete = [
      project({ reporting: { ...input.reporting, estimates: [] } }).result,
      project({ coverage: [] }).result,
      project({ reporting: { ...input.reporting, estimates: [{ ...input.reporting.estimates[0], source_digest: "old" }] } }).result,
      project({ labor: { ...input.labor, projectIssues: [{ projectId, employeeId: uuid(15), periodStart: "2026-10-01", periodEnd: "2026-10-31", kind: "unallocated" }] } }).result,
      project({ reporting: { ...input.reporting, estimates: [{ ...input.reporting.estimates[0], remaining_labor: "10.00" }] } }).result,
    ];
    for (const row of incomplete) {
      const result = buildOverviewProjectEconomics([row], [completed()], null, 2);
      expect(result.averageContract).toBe("1000.00");
      expect(result.averageMargin).toBeNull();
      expect(result.contributionPerArea).toBeNull();
      expect(result.projects[0]).toMatchObject({ costs: null, contribution: null, margin: null });
      expect(result.highlights.highestMargin).toBeNull();
    }
  });

  it("excludes contracts with unavailable FX rather than adding partial or native values", () => {
    const { input } = project();
    const row = project({ reporting: { ...input.reporting, contracts: [input.reporting.contracts[0], { ...input.reporting.contracts[0], id: uuid(16), order_id: uuid(17), currency: "EUR" }] } }).result;
    const result = buildOverviewProjectEconomics([row], [completed()], null, 2);
    expect(result.averageContract).toBeNull();
    expect(result.projects).toEqual([]);
  });

  it("distinguishes explicitly reviewed zero costs from an unresolved historical valuation", () => {
    const { input } = project();
    const reviewedZero = project({ entries: [], projectRows: [] }).result;
    expect(buildOverviewProjectEconomics([reviewedZero], [completed()], null, 2).projects[0])
      .toMatchObject({ costs: "0.00", contribution: "1000.00", margin: "100.00" });
    const unknownEntries = input.entries.map(entry => ({ ...entry, display_amount: null }));
    const unresolved = project({ entries: unknownEntries, projectRows: projectAmountRows(unknownEntries, input.labor, 2) }).result;
    expect(buildOverviewProjectEconomics([unresolved], [completed()], null, 2).projects[0])
      .toMatchObject({ contract: "1000.00", costs: null, contribution: null, margin: null });
  });
});
