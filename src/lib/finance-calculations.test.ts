import { expect, it } from "vitest";
import { calculatedLaborAmounts, sourceCalculationAmounts, financialCalculationSchema } from "./finance-calculations";
import { historicalLaborPeriodSchema, historicalLaborDisplay } from "./finance-historical-labor";
import { summarizeProvisionalReport } from "./finance-month-reporting";
const id = "61000000-0000-4000-8000-000000000001";
const raw = historicalLaborPeriodSchema.parse({ sourceKey: "salary:2026-09", obligationId: id, scheduleId: id, termsId: id, employeeId: id, label: "Salary",
  periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "UAH", reportingCurrency: "UAH", knownNative: "1000", recognizedNative: "300", remainingNative: "700",
  knownStudioCost: "1000", recognizedCost: "300", calculatedCost: "700", unattributedCost: "500", allocations: [{ projectId: id, amount: "200" }], projectIds: [id],
  expectedMinutes: 1000, completedDays: 10, requiredDays: 20, missingDates: ["2026-09-03"], issues: ["missing_reports"], fx: null });
it("combines only unrecognized payroll delta with existing ledger cost and retains the studio remainder", () => {
  const periods = historicalLaborDisplay([raw], "UAH", 2, new Map());
  const pending = calculatedLaborAmounts(periods);
  expect(pending.map(row => row.display_amount)).toEqual(["200.00", "500.00"]);
  expect(pending.find(row => row.project_id === null)?.display_amount).toBe("500.00");
  const summary = summarizeProvisionalReport([{ id, source_entry_id: id, allocation_id: null, project_id: null, classification: "labor", recognized_on: "2026-09-30", display_amount: "300" }], pending, "2026-09-01", "2026-09-30", 2);
  expect(summary.combined.totals.labor.known).toBe("1000.00");
  expect(summary.incomplete).toBe(true);
  expect(calculatedLaborAmounts(historicalLaborDisplay([{ ...raw, remainingNative: "0", calculatedCost: "0", allocations: [], unattributedCost: "0" }], "UAH", 2, new Map()))).toEqual([]);
});
it("keeps unknown sources separate from dated FX gaps", () => {
  const source = financialCalculationSchema.parse({ id: `earning:${id}`, sourceId: id, classification: "revenue", date: "2026-09-30", projectId: id, currency: "USD", amount: "100", reportingAmount: null, reportingCurrency: "UAH", label: "Accepted work", issue: null, href: "/projects/x" });
  expect(sourceCalculationAmounts([source], new Map())[0]).toMatchObject({ display_amount: null, unresolved: "fx" });
  expect(sourceCalculationAmounts([{ ...source, amount: null, issue: "source_conflict" }], new Map())[0]).toMatchObject({ display_amount: null, incomplete: true, unresolved: "source" });
});
it("accepts stable database GUIDs for read-only service periods without creating cash sources", () => {
  const sourceId = "9f8bf629-47f1-0c43-2995-e3354a0ec256";
  expect(financialCalculationSchema.parse({ id: `service:${sourceId}:2026-09-01`, sourceId, classification: "overhead", date: "2026-09-30", projectId: null,
    currency: "UAH", amount: "1000", reportingAmount: null, reportingCurrency: "UAH", label: "Monthly service", issue: null, href: "/finance/schedules" }).sourceId).toBe(sourceId);
});
