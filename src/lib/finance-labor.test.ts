import { describe, expect, it } from "vitest";
import { laborCapacityDefaults, laborDataSchema, laborSourceIssues, projectLaborIncomplete, projectProvisionalLabor, unallocatedLaborAmount, type FinanceLaborData, type LaborPool, type LaborSource } from "./finance-labor";

const obligationId = "61000000-0000-4000-8000-000000000001";
const entryId = "61000000-0000-4000-8000-000000000002";
const employeeId = "61000000-0000-4000-8000-000000000003";

function source(overrides: Partial<LaborSource> = {}): LaborSource {
  return {
    obligationId, employeeId, label: "Studio payroll", kind: "payroll", periodStart: "2026-09-01", periodEnd: "2026-09-30",
    currency: "UAH", knownCost: "1200.00", recognizedCost: "1000.00", remainingCost: "200.00",
    deductionsStatus: "unknown", employerStatus: "unknown", basis: "net", version: "a".repeat(32), snapshot: {},
    sourceReady: true, canConfirm: true, ...overrides,
  };
}

function pool(overrides: Partial<LaborPool> = {}): LaborPool {
  return {
    id: entryId, obligation_id: obligationId, employee_id: employeeId, description: "Studio payroll",
    period_start: "2026-09-01", period_end: "2026-09-30", recognized_on: "2026-10-01", currency: "UAH", amount: "500.00",
    reporting_currency: "UAH", available_reporting_amount: "500.00", allocated_amount: "120.02", allocation_revision: 1,
    fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-10-01", ...overrides,
  };
}

describe("labor source issue composition", () => {
  it("surfaces unknown net components alongside a confirmable known remainder", () => {
    expect(laborSourceIssues([source()], "2026-09-01", "2026-09-30")).toEqual([
      { obligationId, label: "Studio payroll", kind: "deductions", periodStart: "2026-09-01" },
      { obligationId, label: "Studio payroll", kind: "employer_cost", periodStart: "2026-09-01" },
      { obligationId, label: "Studio payroll", kind: "unconfirmed", periodStart: "2026-09-01" },
    ]);
  });

  it("treats fixed zero extras as complete after recognition and preserves open-period issues", () => {
    for (const basis of ["net", "gross"] as const) {
      const known = source({ basis, deductionsStatus: "fixed", employerStatus: "fixed", knownCost: "1000", recognizedCost: "1000", remainingCost: "0" });
      expect(laborSourceIssues([known], "2026-09-01", "2026-09-30")).toEqual([]);
      expect(laborSourceIssues([{ ...known, remainingCost: "1000", canConfirm: false }], "2026-09-01", "2026-09-30").map(issue => issue.kind)).toEqual(["period_open"]);
    }
  });

  it("does not treat unknown employee deductions as a gross-payroll issue", () => {
    expect(laborSourceIssues([source({ basis: "gross", employerStatus: "fixed", remainingCost: "0.00" })], "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("distinguishes an unavailable source from an open period", () => {
    expect(laborSourceIssues([source({ sourceReady: false, canConfirm: false, deductionsStatus: "fixed", employerStatus: "fixed" })], "2026-09-01", "2026-09-30").map(issue => issue.kind))
      .toEqual(["source_unavailable", "period_open"]);
  });

  it("flags a consumed amount above current known cost for reconciliation", () => {
    expect(laborSourceIssues([source({ remainingCost: "-0.01", deductionsStatus: "fixed", employerStatus: "fixed" })], "2026-09-01", "2026-09-30").map(issue => issue.kind))
      .toEqual(["needs_reconciliation"]);
  });

  it("includes only service periods overlapping the selected range", () => {
    const outside = source({ obligationId: "61000000-0000-4000-8000-000000000004", periodStart: "2026-08-01", periodEnd: "2026-08-31" });
    expect(laborSourceIssues([source(), outside], "2026-09-10", "2026-09-20").map(issue => issue.obligationId)).toEqual([obligationId, obligationId, obligationId]);
  });
});

describe("labor allocation display amounts", () => {
  it("computes remaining reporting capacity in currency minor units", () => {
    expect(unallocatedLaborAmount(pool({ available_reporting_amount: "500.01", allocated_amount: "120.02" }), 2)).toBe("379.99");
    expect(unallocatedLaborAmount(pool({ available_reporting_amount: "10.123", allocated_amount: "0.001" }), 3)).toBe("10.122");
  });

  it("keeps unallocated value unknown while reporting FX is unresolved", () => {
    expect(unallocatedLaborAmount(pool({ available_reporting_amount: null, allocated_amount: "0.00" }), 2)).toBeNull();
  });
});

describe("project-scoped labor completeness", () => {
  const projectId = "61000000-0000-4000-8000-000000000005";
  const otherProjectId = "61000000-0000-4000-8000-000000000006";
  const data = (projectIssues: FinanceLaborData["projectIssues"]): FinanceLaborData => ({
    sources: [source()], pools: [pool()], allocations: [], allocationHistory: [], missingPeriods: [], projectIssues,
  });

  it("does not turn legitimate studio remainder or another project's missing reports into an error", () => {
    const report = data([{ projectId: otherProjectId, employeeId, periodStart: "2026-09-01", periodEnd: "2026-09-30", kind: "missing_reports" }]);
    expect(projectLaborIncomplete(report, projectId, "2026-09-01", "2026-09-30")).toBe(false);
    expect(projectLaborIncomplete(report, otherProjectId, "2026-09-01", "2026-09-30")).toBe(true);
    expect(projectLaborIncomplete(data([]), projectId, "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("limits corrections and unknown sources to their affected project and service period", () => {
    const report = data([{ projectId, employeeId, periodStart: "2026-09-01", periodEnd: "2026-09-30", kind: "pending_review" }]);
    expect(projectLaborIncomplete(report, projectId, "2026-10-01", "2026-10-31")).toBe(false);
    expect(projectLaborIncomplete(report, projectId, "2026-09-15", "2026-09-15")).toBe(true);
  });

  it("preserves source completeness for older database payloads", () => {
    expect(projectLaborIncomplete(data(undefined), projectId, "2026-09-01", "2026-09-30")).toBe(true);
  });
});

describe("provisional project labor display", () => {
  const projectId = "61000000-0000-4000-8000-000000000005";
  const otherProjectId = "61000000-0000-4000-8000-000000000006";
  const provisional = (overrides: Partial<NonNullable<FinanceLaborData["automaticPeriods"]>[number]> = {}): NonNullable<FinanceLaborData["automaticPeriods"]>[number] => ({
    obligationId, employeeId, label: "October payroll", periodStart: "2026-10-01", periodEnd: "2026-10-31", digest: "b".repeat(32),
    source: source({ periodStart: "2026-10-01", periodEnd: "2026-10-31" }), expectedMinutes: 11160, completedDays: 6, requiredDays: 6,
    missingDates: [], projectIds: [projectId], issues: [], manual: false, status: "provisional", shares: { [projectId]: 60 },
    pools: [], accruedFrom: "2026-10-03", asOf: "2026-10-08", reportingCurrency: "UAH", provisionalAllocations: [{ projectId, amount: "100.00" }],
    provisionalRemainder: "900.00", provisionalFx: null, ...overrides,
  });
  const data = (automaticPeriods: FinanceLaborData["automaticPeriods"], projectIssues: FinanceLaborData["projectIssues"] = []): FinanceLaborData => ({
    sources: [], pools: [], allocations: [], allocationHistory: [], missingPeriods: [], automaticPeriods, projectIssues,
  });

  it("includes only overlapping provisional project amounts and reports their as-of date", () => {
    const report = projectProvisionalLabor(data([provisional()]), projectId, "2026-10-01", "2026-10-08", "UAH", 2, new Map());
    expect(report).toEqual({ known: "100.00", unknown: 0, asOf: "2026-10-08", periods: 1 });
    expect(projectProvisionalLabor(data([provisional()]), projectId, "2026-10-09", "2026-10-31", "UAH", 2, new Map()))
      .toEqual({ known: "0.00", unknown: 0, asOf: null, periods: 0 });
    expect(projectProvisionalLabor(data([provisional()]), otherProjectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).periods).toBe(0);
  });

  it("excludes finalized, manually owned, and already recognized pool periods", () => {
    const report = projectProvisionalLabor(data([
      provisional({ obligationId: "61000000-0000-4000-8000-000000000007" }),
      provisional({ obligationId: "61000000-0000-4000-8000-000000000008", status: "applied" }),
      provisional({ obligationId: "61000000-0000-4000-8000-000000000009", manual: true }),
      provisional({ obligationId: "61000000-0000-4000-8000-000000000010", pools: [{ id: entryId, available: "10.00", native: "10.00", revision: 1, fx: null }] }),
    ]), projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map());
    expect(report).toEqual({ known: "100.00", unknown: 0, asOf: "2026-10-08", periods: 1 });
  });

  it("uses dated provisional allocations for a custom project report window", () => {
    const report = projectProvisionalLabor(data([provisional({
      provisionalAllocations: [{ projectId, amount: "100.00" }],
      provisionalDailyAllocations: [
        { date: "2026-10-03", projectId, amount: "40.00" },
        { date: "2026-10-08", projectId, amount: "60.00" },
        { date: "2026-10-08", projectId: otherProjectId, amount: "15.00" },
      ],
    })]), projectId, "2026-10-08", "2026-10-08", "UAH", 2, new Map());
    expect(report).toEqual({ known: "60.00", unknown: 0, asOf: "2026-10-08", periods: 1 });
  });
  it("includes only the closed unrecognized project delta alongside existing recognized pools", () => {
    const period = provisional({ status: "pending", asOf: "2026-10-31",
      source: source({ knownCost: "1000", recognizedCost: "400", remainingCost: "600" }),
      provisionalAllocations: [{ projectId, amount: "150" }], provisionalRemainder: "450",
      provisionalDailyAllocations: [{ date: "2026-10-31", projectId, amount: "150" }],
      pools: [{ id: entryId, available: "400", native: "400", revision: 1, fx: null }],
    });
    const input = data([period], [{ projectId, employeeId, periodStart: "2026-10-01", periodEnd: "2026-10-31", kind: "pending_review" }]);
    expect(projectProvisionalLabor(input, projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()))
      .toEqual({ known: "150.00", unknown: 1, asOf: "2026-10-31", periods: 1 });
    period.source = source({ knownCost: "1000", recognizedCost: "1000", remainingCost: "0" });
    expect(projectProvisionalLabor(input, projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).periods).toBe(0);
  });

  it("keeps missing provisional value visible and uses the historical provisional FX date", () => {
    const missing = provisional({ obligationId: "61000000-0000-4000-8000-000000000011", provisionalRemainder: null });
    const foreign = provisional({ obligationId: "61000000-0000-4000-8000-000000000012",
      provisionalAllocations: [{ projectId, amount: "100.00" }], provisionalFx: { rate: "0.02", source: "nbu", effectiveDate: "2026-10-07" } });
    const noFx = provisional({ obligationId: "61000000-0000-4000-8000-000000000013", reportingCurrency: "UAH",
      provisionalAllocations: [{ projectId, amount: "100.00" }], provisionalFx: null });
    const report = projectProvisionalLabor(data([missing, foreign, noFx]), projectId, "2026-10-01", "2026-10-31", "USD", 2,
      new Map([["2026-10-07", "0.02"]]));
    expect(report).toEqual({ known: "2.00", unknown: 2, asOf: "2026-10-08", periods: 3 });
  });

  it("marks unknown payroll components and only the affected employee-project report incomplete", () => {
    const unknownSource = provisional({ obligationId: "61000000-0000-4000-8000-000000000014", issues: ["unknown_employer_cost"] });
    const row = (projectId: string, employee: string, periodStart = "2026-10-01") => ({
      projectId, employeeId: employee, periodStart, periodEnd: "2026-10-31", kind: "missing_reports",
    });
    const missingReports = data([provisional()], [row(projectId, employeeId)]);
    expect(projectProvisionalLabor(missingReports, projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).unknown).toBe(1);
    expect(projectProvisionalLabor(missingReports, otherProjectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).unknown).toBe(0);
    expect(projectProvisionalLabor(data([provisional()], [row(projectId, "61000000-0000-4000-8000-000000000099")]),
      projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).unknown).toBe(0);
    expect(projectProvisionalLabor(data([unknownSource]), projectId, "2026-10-01", "2026-10-31", "UAH", 2, new Map()).unknown).toBe(1);
  });

  it("reports a confirmed zero-cost share without requiring an FX quote", () => {
    const zero = provisional({
      obligationId: "61000000-0000-4000-8000-000000000015",
      source: source({ currency: "EUR", knownCost: "0.00", recognizedCost: "0.00", remainingCost: "0.00",
        deductionsStatus: "fixed", employerStatus: "fixed" }),
      reportingCurrency: "UAH", provisionalAllocations: [{ projectId, amount: "0.00" }],
      provisionalRemainder: "0.00", provisionalFx: null,
    });
    expect(projectProvisionalLabor(data([zero]), projectId, "2026-10-01", "2026-10-31", "USD", 2, new Map()))
      .toEqual({ known: "0.00", unknown: 0, asOf: "2026-10-08", periods: 1 });
  });
});

describe("dated labor setup defaults", () => {
  it("accepts optional internal classification and unresolved source review IDs", () => {
    expect(laborDataSchema.shape.automation.parse({ startsOn: "2026-10-01", internalProjectId: null })).toEqual({ startsOn: "2026-10-01", internalProjectId: null });
    expect(laborDataSchema.shape.sourceReview.parse({ digest: "a".repeat(32), reviewed: false, cashTermIds: [], unresolvedTermIds: [obligationId], recurring: [] })?.unresolvedTermIds)
      .toEqual([obligationId]);
  });

  it("offers current settings without claiming historical evidence", () => {
    expect(laborCapacityDefaults([], 480, "2026-10-01"))
      .toEqual({ dailyMinutes: 480, weekdays: [1, 2, 3, 4, 5], effectiveFrom: null });
  });
  it("uses effective employee capacity before studio defaults and ignores future revisions", () => {
    const rows = [
      { id: entryId, employee_id: null, effective_from: "2026-10-01", daily_minutes: 480, weekdays: [1, 2, 3, 4, 5] },
      { id: obligationId, employee_id: employeeId, effective_from: "2026-09-01", daily_minutes: 360, weekdays: [1, 2, 3] },
      { id: employeeId, employee_id: employeeId, effective_from: "2026-11-01", daily_minutes: 240, weekdays: [1] },
    ];
    expect(laborCapacityDefaults(rows, 600, "2026-10-21", employeeId))
      .toEqual({ dailyMinutes: 360, weekdays: [1, 2, 3], effectiveFrom: "2026-09-01" });
    expect(laborCapacityDefaults(rows, 600, "2026-10-21"))
      .toEqual({ dailyMinutes: 480, weekdays: [1, 2, 3, 4, 5], effectiveFrom: "2026-10-01" });
  });
});
