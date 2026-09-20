import { describe, expect, it } from "vitest";
import { parseFinanceReportParams, financeOverviewSchema } from "./finance-overview";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

describe("Overview report context", () => {
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
