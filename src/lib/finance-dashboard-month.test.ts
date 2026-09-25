import { expect, it } from "vitest";
import { financeDashboardMonthSummary } from "./finance-overview";

it("uses current-month operating client inflows and actual operating P&L with exact decimals", () => {
  const result = financeDashboardMonthSummary({
    forecast: { asOf: "2026-09-25", currency: "UAH", items: [
      { direction: "incoming", nature: "operating", date: "2026-09-28", reportingAmount: "100.10" },
      { direction: "incoming", nature: "operating", date: "2026-09-30", reportingAmount: "200.20" },
      { direction: "incoming", nature: "financing", date: "2026-09-30", reportingAmount: "999.00" },
      { direction: "incoming", nature: "operating", date: "2026-10-01", reportingAmount: "30.00" },
    ] },
    flows: [
      { month: "2026-09-01", nature: "operating", direction: "incoming", amount: "500.10" },
      { month: "2026-09-01", nature: "operating", direction: "outgoing", amount: "600.20" },
      { month: "2026-09-01", nature: "financing", direction: "incoming", amount: "900.00" },
    ],
  });
  expect(result).toEqual({ currency: "UAH", expectedInflow: "300.3000", profitAndLoss: "-100.1000" });
  expect(financeDashboardMonthSummary({ forecast: { asOf: "2026-09-25", currency: "UAH", items: [{ direction: "incoming", nature: "operating", date: "2026-09-30", reportingAmount: null }] }, flows: [] }).expectedInflow).toBeNull();
});

it("does not cap a report aggregate at the project-plan input limit", () => {
  expect(financeDashboardMonthSummary({ forecast: { asOf: "2026-09-25", currency: "UAH", items: [{ direction: "incoming", nature: "operating", date: "2026-09-30", reportingAmount: "12345678901.25" }] }, flows: [] }).expectedInflow).toBe("12345678901.2500");
});
