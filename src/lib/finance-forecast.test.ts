import { describe, expect, it } from "vitest";
import { budgetInputSchema, forecastFxSchema, forecastOptionsSchema } from "./finance-forecast";
const id = "67000000-0000-4000-8000-000000000001";
describe("cash planning input boundaries", () => {
  it("accepts twelve exact decimal strings, explicit zero and a required revision note", () => {
    const budget = { requestId: id, categoryId: id, year: "2026", revision: "0", reason: "Approved", months: Array.from({ length: 12 }, () => "80,25") };
    expect(budgetInputSchema.parse(budget).months[0]).toBe("80.25");
    for (const patch of [{ reason: " " }, { months: ["1"] }, { months: Array(12).fill("-1") }, { months: Array(12).fill("1e3") }, { year: "2026.5" }, { revision: -1 }]) expect(budgetInputSchema.safeParse({ ...budget, ...patch }).success).toBe(false);
    expect(budgetInputSchema.parse({ ...budget, months: Array(12).fill("0") }).months[0]).toBe("0");
  });
  it("keeps confirmed/planned separate and defaults to six months", () => {
    expect(forecastOptionsSchema.parse({})).toEqual({ horizon: "6", scenario: "confirmed" });
    for (const horizon of ["3", "6", "year", "12"]) expect(forecastOptionsSchema.parse({ horizon, scenario: "planned" }).horizon).toBe(horizon);
    expect(forecastOptionsSchema.safeParse({ scenario: "optimistic" }).success).toBe(false);
  });
  it("rejects duplicate, negative and non-finite rates with missing context", () => {
    const rate = { currency: "USD", rate: "40.1234567890", source: "manual", effectiveDate: "2026-09-17" };
    expect(forecastFxSchema.safeParse([rate]).success).toBe(true);
    expect(forecastFxSchema.safeParse([rate, rate]).success).toBe(false);
    for (const patch of [{ rate: "0" }, { rate: "NaN" }, { rate: "-1" }, { rate: "40.12345678901" }, { effectiveDate: "" }, { source: "historical" }]) expect(forecastFxSchema.safeParse([{ ...rate, ...patch }]).success).toBe(false);
  });
});
