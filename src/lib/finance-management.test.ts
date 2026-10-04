import { describe, expect, it } from "vitest";
import {
  managementCoverageIssues,
  managementDisplayEntries,
  recognitionSourceHref,
  summarizeManagementEntries,
  type RecognitionEntry,
  type ReportCoverage,
} from "./finance-management";

const projectId = "62000000-0000-4000-8000-000000000001";
const entryId = "62000000-0000-4000-8000-000000000002";
const movementId = "62000000-0000-4000-8000-000000000003";
const expectedId = "62000000-0000-4000-8000-000000000004";
const categoryId = "62000000-0000-4000-8000-000000000005";

function entry(overrides: Partial<RecognitionEntry> = {}): RecognitionEntry {
  return {
    id: entryId, kind: "recognition", classification: "revenue", source_kind: "movement", terms_id: null,
    expected_item_id: null, movement_id: null, trip_entry_id: null, obligation_id: null, employee_id: null, project_id: projectId, category_id: categoryId, source_snapshot: {},
    period_start: "2026-08-01", period_end: "2026-08-31", recognized_on: "2026-09-03", description: "Revenue",
    currency: "USD", amount: "100.00", vat_amount: "0.00", gross_amount: "100.00", reporting_currency: "USD",
    reporting_amount: "100.00", fx_rate: null, fx_source: null, fx_effective_date: null, related_entry_id: null,
    reason: "", created_at: "2026-09-03T12:00:00Z", ...overrides,
  };
}

function coverage(overrides: Partial<ReportCoverage> = {}): ReportCoverage {
  return {
    id: entryId, project_id: null, month: "2026-09-01", reviewed_through: "2026-09-30", revision: 1,
    revenue_reviewed: true, direct_costs_reviewed: true, labor_reviewed: true, overhead_reviewed: true, changed_since_review:false, ...overrides,
  };
}

describe("management report periods and totals", () => {
  it("selects recognition by recognized date while retaining the source period", () => {
    const rows = [entry({ recognized_on: "2026-09-03", period_start: "2026-08-01", period_end: "2026-08-31" }),
      entry({ id: movementId, recognized_on: "2026-08-31", period_start: "2026-09-01", period_end: "2026-09-30" })];
    const result = summarizeManagementEntries(rows.map(row => ({ ...row, display_amount: row.amount })), "2026-09-01", "2026-09-30", 2);
    expect(result.rows.map(row => row.id)).toEqual([entryId]);
    expect(result.rows[0]).toMatchObject({ recognized_on: "2026-09-03", period_start: "2026-08-01", period_end: "2026-08-31" });
  });

  it("reports known subtotal and missing FX separately instead of treating missing values as zero", () => {
    const rows = [
      { ...entry({ classification: "revenue", amount: "100.00" }), display_amount: "100.00" },
      { ...entry({ id: movementId, classification: "direct_cost", amount: "20.00" }), display_amount: "20.00" },
      { ...entry({ id: expectedId, classification: "revenue", amount: "50.00" }), display_amount: null },
    ];
    expect(summarizeManagementEntries(rows, "2026-09-01", "2026-09-30", 2)).toMatchObject({
      knownResult: "80.00", missingFx: 1,
      totals: { revenue: { known: "100.00", missingFx: 1 }, direct_cost: { known: "20.00", missingFx: 0 } },
    });
  });

  it("converts historical amounts with each entry's FX effective date, including reversals", () => {
    const original = entry({ reporting_currency: "USD", reporting_amount: "100.00", fx_effective_date: "2026-08-31" });
    const reversal = entry({ id: movementId, kind: "reversal", classification: "revenue", reporting_currency: "USD", reporting_amount: "-100.00", fx_effective_date: "2026-08-31", related_entry_id: entryId });
    const displayed = managementDisplayEntries([original, reversal], "UAH", 2, new Map([["2026-08-31", "40"], ["2026-09-03", "50"]]));
    expect(displayed.map(row => row.display_amount)).toEqual(["4000.00", "-4000.00"]);
  });
});

describe("management report coverage and source links", () => {
  it("accepts explicitly reviewed zero activity and reports a partial-month coverage gap", () => {
    expect(managementCoverageIssues([coverage({ reviewed_through: "2026-09-20" })], "2026-09-10", "2026-09-20", null)).toEqual([]);
    expect(managementCoverageIssues([coverage({ reviewed_through: "2026-09-19" })], "2026-09-10", "2026-09-20", null)).toEqual([
      { month: "2026-09-01", classification: "revenue" },
      { month: "2026-09-01", classification: "direct_cost" },
      { month: "2026-09-01", classification: "labor" },
      { month: "2026-09-01", classification: "overhead" },
    ]);
  });

  it("builds fixed internal source routes from known IDs, never snapshot URLs", () => {
    expect(recognitionSourceHref(entry({ movement_id: movementId, expected_item_id: expectedId, source_snapshot: { url: "https://example.com" } })))
      .toBe(`/finance/movements?movement=${movementId}`);
    expect(recognitionSourceHref(entry({ movement_id: null, expected_item_id: expectedId }))).toBe(`/finance/expected?item=${expectedId}`);
    expect(recognitionSourceHref(entry({ movement_id: null, expected_item_id: null }))).toBe(`/projects/${projectId}?view=finance`);
    expect(recognitionSourceHref(entry({ project_id: null, movement_id: null, expected_item_id: null, source_snapshot: { url: "javascript:alert(1)" } })))
      .toBe("/finance/reports");
  });
});
