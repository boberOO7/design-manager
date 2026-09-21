import { describe, expect, it } from "vitest";
import { parseFinanceReportParams, financeOverviewSchema, financeCashChartPoints } from "./finance-overview";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

describe("Overview report context", () => {
  it("crops the trend without changing exact balances, today's valuation boundary or the full planning series", () => {
    const data = {
      forecast: { asOf: "2026-09-20", through: "2027-02-28", cashBase: "1234567890123456.78" },
      history: [{ date: "2026-07-01", amount: null }, { date: "2026-09-20", amount: "1234567890123000.12" }],
      projection: [{ date: "2026-09-20", amount: "1234567890123500.01" }, { date: "2026-10-01", amount: "1234567890123300.99" }, { date: "2026-11-01", amount: "-10.00" }, { date: "2027-02-28", amount: "90.00" }],
    };
    const points = financeCashChartPoints(data, "2026-10-20");
    expect(points.slice(0, 3).map(p => p.amount)).toEqual([null, "1234567890123000.12", "1234567890123456.78"]);
    expect(points.at(-1)).toEqual({ date: "2026-10-20", amount: "1234567890123300.99", kind: "forecast" });
    expect(points.every(p => p.date <= "2026-10-20")).toBe(true);
    expect(financeCashChartPoints(data).at(-1)?.amount).toBe("90.00");
    expect(financeCashChartPoints(data, "2026-10-01").filter(p => p.date === "2026-10-01")).toHaveLength(1);
  });
  it("defaults to confirmed six months with independent three-month actual history", () => {
    expect(parseFinanceReportParams({}, "2026-09-20")).toEqual({ options: { horizon: "6", scenario: "confirmed" }, period: "3", fx: [], invalidFx: false });
  });
  it("preserves every supported horizon/scenario and validates FX at the boundary", () => {
    for (const horizon of ["3", "6", "year", "12"]) {
      const context = parseFinanceReportParams({ horizon, scenario: "planned", period: "year", fx_USD: "40,12" }, "2026-09-20");
      expect(context.options).toEqual({ horizon, scenario: "planned" });
      expect(context.fx).toEqual([{ currency: "USD", rate: "40.12", source: "manual", effectiveDate: "2026-09-20" }]);
      expect(context.period).toBe("year");
    }
    expect(parseFinanceReportParams({ fx_USD: "0" }, "2026-09-20")).toMatchObject({ fx: [], invalidFx: true });
    expect(parseFinanceReportParams({ horizon: ["3", "12"], period: "invalid" }, "2026-09-20")).toMatchObject({ options: { horizon: "6", scenario: "confirmed" }, period: "3" });
  });
  it("rejects unvalidated RPC values and keeps localization keys complete", () => {
    expect(financeOverviewSchema.safeParse({ forecast: {} }).success).toBe(false);
    expect(Object.keys(uk.Finance.overview)).toEqual(Object.keys(en.Finance.overview));
  });
});
