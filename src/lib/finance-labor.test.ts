import { describe, expect, it } from "vitest";
import { laborSourceIssues, unallocatedLaborAmount, type LaborPool, type LaborSource } from "./finance-labor";

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
