import { describe, expect, it } from "vitest";
import { financeAccountSchema, financeSettingsSchema, formatFinanceAmount } from "./finance";

const currencies = ["UAH", "USD", "EUR", "PLN"].map((code) => ({ code, minor_units: 2 })).concat([
  { code: "JPY", minor_units: 0 }, { code: "KWD", minor_units: 3 }, { code: "CLF", minor_units: 4 },
]);
const account = { accountId: "", name: "  Bank  ", currency: "UAH", openingBalance: "-1200,25" };

describe("Finance foundation inputs", () => {
  it("preserves signed opening amounts and currency precision without truncation", () => {
    expect(financeAccountSchema(currencies).parse(account)).toMatchObject({ name: "Bank", openingBalance: -1200.25 });
    for (const [currency, openingBalance] of [["UAH", "0"], ["JPY", "25"], ["KWD", "1.234"], ["CLF", "1.2345"]]) {
      expect(financeAccountSchema(currencies).safeParse({ ...account, currency, openingBalance }).success).toBe(true);
    }
  });
  it.each(["", "NaN", "Infinity", "1e3", "1.234", "10000000000", "1 000", "12x", "--1"])("rejects invalid amounts before numeric conversion: %s", (openingBalance) => {
    expect(financeAccountSchema(currencies).safeParse({ ...account, openingBalance }).success).toBe(false);
  });
  it("rejects unknown currencies, blank names, foreign-shaped IDs, and fractional yen", () => {
    for (const patch of [{ currency: "ABC" }, { name: " " }, { accountId: "not-a-uuid" }, { currency: "JPY", openingBalance: "1.5" }]) {
      expect(financeAccountSchema(currencies).safeParse({ ...account, ...patch }).success).toBe(false);
    }
  });
  it("validates real calendar dates and catalog-backed reporting currencies", () => {
    const schema = financeSettingsSchema(currencies);
    expect(schema.safeParse({ baseCurrency: "KWD", cutoverDate: "2026-09-16" }).success).toBe(true);
    for (const cutoverDate of ["2026-02-30", "1899-12-31", "", "2026-09-16T12:00:00Z"]) expect(schema.safeParse({ baseCurrency: "UAH", cutoverDate }).success).toBe(false);
    expect(schema.safeParse({ baseCurrency: "ABC", cutoverDate: "2026-09-16" }).success).toBe(false);
  });
  it("displays cents and non-two-decimal currencies in both locales", () => {
    for (const currency of currencies.slice(0, 4)) {
      expect(formatFinanceAmount(12.34, currency, "en")).toContain("12.34");
      expect(formatFinanceAmount(12.34, currency, "uk")).toContain("12,34");
    }
    expect(formatFinanceAmount(1.234, currencies[5], "en")).toContain("1.234");
    expect(formatFinanceAmount(25, currencies[4], "en")).not.toContain(".00");
  });
});
