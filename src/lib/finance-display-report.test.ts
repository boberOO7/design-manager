import { describe, expect, it } from "vitest";
import { financeOverviewSchema, financeDashboardMonthSummary } from "./finance-overview";
import { convertFinanceDisplayAmount, projectFinanceDisplayReport } from "./finance-display-report";
import { financeDisplayCurrency } from "./finance-display-currency";

const categoryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

describe("Finance display currency", () => {
  it("defaults to USD and rounds signed money without floating point", () => {
    expect(financeDisplayCurrency(undefined)).toBe("USD");
    expect(financeDisplayCurrency("PLN")).toBe("PLN");
    expect(convertFinanceDisplayAmount("-473746.94", "0.02229038")).toBe("-10560.00");
    expect(convertFinanceDisplayAmount("12988.80", "44.8624")).toBe("582708.74");
    expect(convertFinanceDisplayAmount("10560.00", "44.8624")).toBe("473746.94");
  });

  it("values mixed historical dates before aggregation while keeping forecast and native amounts separate", () => {
    const data = financeOverviewSchema.parse({
      forecast: {
        version: 1, asOf: "2026-09-30", from: "2026-09-01", through: "2026-10-31", cutover: "2026-09-01",
        currency: "UAH", scenario: "confirmed", horizon: "3", fx: [], cashBase: "600.00", cashIncomplete: false,
        months: [{ month: "2026-09-01", remaining: "100.00", closing: "700.00" }],
        items: [{
          id: itemId, categoryId, description: "Payment", direction: "incoming", nature: "operating",
          currency: "USD", amount: "10.00", reportingAmount: "400.00", date: "2026-10-01",
          dueDate: null, expectedDate: null, commitment: "agreed", certainty: "fixed", version: 1,
          projectId: null, stream: null, component: null, obligationKind: null,
        }],
        issues: [],
        comparisons: [{
          month: "2026-09-01", category_id: categoryId, category: "Revenue", direction: "incoming", nature: "operating",
          budget_revision_id: null, budget_revision: null, budget: "300.00", remaining: "100.00",
          incomplete: false, actual: "600.00", full_period: "700.00",
        }],
      },
      period: "month", actualFrom: "2026-09-01", upcomingThrough: "2026-10-30", historyIncomplete: false,
      history: [{ date: "2026-09-10", amount: "400.00" }, { date: "2026-09-20", amount: "600.00" }],
      projection: [{ date: "2026-09-30", amount: "600.00" }],
      lowPoint: { date: "2026-09-30", amount: "600.00" },
      flows: [{ month: "2026-09-01", nature: "operating", direction: "incoming", amount: "600.00" }],
      netFlow: "600.00", accounts: [{ id: itemId, name: "USD account", currency: "USD", native: "10.00", amount: "600.00" }],
      receivables: [], receivableTotal: "0", receivablesIncomplete: false,
      outgoingTotal: "0", outgoingIncomplete: false, requiredCurrencies: [],
      categories: [{ id: categoryId, name: "Revenue", direction: "incoming", nature: "operating", budget: "300.00", actual: "600.00", forecast: "700.00", incomplete: false, variance: "400.00" }],
    });
    const projected = projectFinanceDisplayReport(data, "USD", 2, "0.03", new Map([["2026-09-10", "0.025"], ["2026-09-20", "0.02"]]), [
      { financial_date: "2026-09-10", amount: "400.00" }, { financial_date: "2026-09-20", amount: "200.00" },
    ], [
      { financial_date: "2026-09-10", amount: "400.00", category_id: categoryId, direction: "incoming", nature: "operating" },
      { financial_date: "2026-09-20", amount: "200.00", category_id: categoryId, direction: "incoming", nature: "operating" },
    ], []);
    expect(projected.history.map(point => point.amount)).toEqual(["10.00", "14.00"]);
    expect(projected.flows[0].amount).toBe("14.00");
    expect(projected.categories[0]).toMatchObject({ actual: "14.00", forecast: "17.00", budget: "9.00", variance: "8.00" });
    expect(projected.forecast.cashBase).toBe("18.00");
    expect(projected.forecast.items[0]).toMatchObject({ amount: "10.00", currency: "USD", reportingAmount: "12.00" });
    expect(projected.accounts[0]).toMatchObject({ native: "10.00", currency: "USD", amount: "18.00" });
    const afterCutover = projectFinanceDisplayReport({ ...data,
      forecast: { ...data.forecast, cutover: "2026-09-15", cashBase: "200.00" },
      history: [{ date: "2026-09-10", amount: null }, { date: "2026-09-20", amount: "200.00" }],
    }, "USD", 2, "0.03", new Map([["2026-09-10", "0.025"], ["2026-09-20", "0.02"]]), [
      { financial_date: "2026-09-10", amount: "400.00" }, { financial_date: "2026-09-20", amount: "200.00" },
    ], [
      { financial_date: "2026-09-10", amount: "400.00", category_id: categoryId, direction: "incoming", nature: "operating" },
      { financial_date: "2026-09-20", amount: "200.00", category_id: categoryId, direction: "incoming", nature: "operating" },
    ], []);
    expect(afterCutover.history.map(point => point.amount)).toEqual([null, "4.00"]);
    expect(afterCutover.flows[0].amount).toBe("14.00");
    expect(afterCutover.forecast.cashBase).toBe("6.00");
    expect(financeDashboardMonthSummary({ ...projected, vatAdjustments: [{ date: "2026-09-10", amount: "2.50" }] }).profitAndLoss).toBe("11.5000");
  });
});
