import { describe, expect, it } from "vitest";
import { historicalLaborCsvRows, historicalLaborDisplay, historicalLaborPeriodSchema, historicalLaborSummary } from "./finance-historical-labor";

const id = "10000000-0000-4000-8000-000000000001", project = "10000000-0000-4000-8000-000000000002";
const period = () => historicalLaborPeriodSchema.parse({ sourceKey: "payroll:employee:2026-09-01", obligationId: id, scheduleId: id, termsId: id,
  employeeId: id, label: "September salary", periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "UAH", reportingCurrency: "UAH",
  knownNative: "1000", recognizedNative: "400", remainingNative: "600", knownStudioCost: "1000", recognizedCost: "400", calculatedCost: "600", unattributedCost: "450",
  allocations: [{ projectId: project, amount: "150" }], projectIds: [project], expectedMinutes: 1000, completedDays: 10, requiredDays: 20,
  missingDates: ["2026-09-03"], issues: ["missing_reports"], fx: { rate: "1", source: "identity", effectiveDate: "2026-09-30" } });

describe("historical read-only labor reporting", () => {
  it("separates recognized, calculated project labor and the studio remainder", () => {
    const values = historicalLaborDisplay([period()], "UAH", 2, new Map());
    expect(historicalLaborSummary(values, "2026-09-01", "2026-09-30", 2))
      .toMatchObject({ known: "600.00", knownStudio: "1000.00", recognized: "400.00", unattributed: "450.00", incomplete: true, hasUnrecognized: true });
    expect(historicalLaborSummary(values, "2026-09-01", "2026-09-30", 2, project).known).toBe("150.00");
    expect(historicalLaborSummary(values, "2026-09-01", "2026-09-29", 2).periods).toBe(0);
  });
  it("keeps unknown salary, capacity and unsupported attribution distinct from zero", () => {
    for (const issue of ["missing_salary", "missing_capacity", "manual_attribution"]) {
      const source = period(); source.issues = [issue]; source.allocations = [];
      if (issue === "missing_salary") { source.calculatedCost = null; source.knownStudioCost = null; source.knownNative = null; source.remainingNative = null; }
      const summary = historicalLaborSummary(historicalLaborDisplay([source], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2, project);
      expect(summary).toMatchObject({ known: null, incomplete: true, issues: [issue] });
    }
    const source = period(); source.allocations = [];
    expect(historicalLaborSummary(historicalLaborDisplay([source], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2, project).known).toBeNull();
  });
  it("does not let known subcomponents certify an incomplete salary", () => {
    const source = period(); source.issues = ["unknown_employer_cost"];
    const summary = historicalLaborSummary(historicalLaborDisplay([source], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2);
    expect(summary).toMatchObject({ known: "600.00", incomplete: true, issues: ["unknown_employer_cost"] });
  });
  it("uses the period FX date and keeps unavailable conversion explicit", () => {
    const source = period();
    const converted = historicalLaborDisplay([source], "EUR", 2, new Map([["2026-09-30", "0.5"], ["2026-10-19", "999"]]));
    expect(converted[0]).toMatchObject({ calculatedCost: "300.00", recognizedCost: "200.00", unattributedCost: "225.00", allocations: [{ amount: "75.00" }] });
    const missing = historicalLaborDisplay([source], "EUR", 2, new Map());
    expect(missing[0]).toMatchObject({ knownNative: "1000", calculatedCost: null, allocations: [{ amount: null }] });
    expect(missing[0].issues).toContain("display_fx");
  });
  it("treats a fully recognized source as zero additional cost, including zero without display FX", () => {
    const source = period(); source.remainingNative = "0"; source.calculatedCost = "0"; source.unattributedCost = "0"; source.allocations = [];
    const values = historicalLaborDisplay([source], "EUR", 2, new Map());
    expect(historicalLaborSummary(values, "2026-09-01", "2026-09-30", 2)).toMatchObject({ known: "0.00", hasUnrecognized: false });
  });
  it("exports historical calculations in a separate source-backed block", () => {
    const rows = historicalLaborCsvRows(historicalLaborDisplay([period()], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", project);
    expect(rows[0]).toContain("calculated_unrecognized");
    expect(rows[1]).toEqual(["payroll:employee:2026-09-01", "September salary", "2026-09-01", "2026-09-30", "1000", "UAH", "400.00", "600.00", "450.00", project, "150.00", "missing_reports"]);
  });
});
