import { describe, expect, it } from "vitest";
import { financeAccountSchema, financeSettingsSchema, openingValuationSchema, formatFinanceAmount, formatFinanceDecimal, canChartFinanceAmount } from "./finance";

const currencies = ["UAH", "USD", "EUR", "PLN"].map((code) => ({ code, minor_units: 2 })).concat([
  { code: "JPY", minor_units: 0 }, { code: "KWD", minor_units: 3 }, { code: "CLF", minor_units: 4 },
]);
const account = { requestId: "62000000-0000-4000-8000-000000000020", accountId: "", name: "  Bank  ", currency: "UAH", openingBalance: "-1200,25" };

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
    for (const patch of [{ requestId: "" }, { requestId: undefined }, { currency: "ABC" }, { name: " " }, { accountId: "not-a-uuid" }, { currency: "JPY", openingBalance: "1.5" }]) {
      expect(financeAccountSchema(currencies).safeParse({ ...account, ...patch }).success).toBe(false);
    }
  });
  it("validates real calendar dates and catalog-backed reporting currencies", () => {
    const schema = financeSettingsSchema(currencies);
    expect(schema.safeParse({ baseCurrency: "KWD", cutoverDate: "2026-09-16" }).success).toBe(true);
    expect(schema.safeParse({ baseCurrency: "UAH", cutoverDate: "2099-12-31" }).success).toBe(true);
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

it("validates opening FX context and explicit positive manual assumptions", () => {
  const input = { accountId: "62000000-0000-4000-8000-000000000001", currency: "USD", reportingCurrency: "UAH", openingAmount: "-5.25", date: "2026-09-01", fxMode: "manual", manualRate: "39,5" };
  expect(openingValuationSchema.safeParse(input).success).toBe(true);
  for (const patch of [{ manualRate: "0" }, { manualRate: "" }, { manualRate: "NaN" }, { date: "2026-02-30" }, { openingAmount: "1e3" }, { reportingCurrency: "EUR", fxMode: "nbu" }]) expect(openingValuationSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});

 it("preserves exact large decimals, currency minor units and locale separators", () => {
  for (const currency of currencies) {
    const fraction = "7891".slice(0, currency.minor_units);
    const amount = `1234567890123456${fraction ? `.${fraction}` : ""}`;
    expect(formatFinanceAmount(amount, currency, "en")).toContain(`1,234,567,890,123,456${fraction ? `.${fraction}` : ""}`);
    expect(formatFinanceAmount(`-${amount}`, currency, "uk").replace(/[\s\u00a0]/g, "")).toContain(`-1234567890123456${fraction ? `,${fraction}` : ""}`);
  }
  expect(formatFinanceDecimal("1234567890123456.78", "en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe("1,234,567,890,123,456.78");
  expect(formatFinanceAmount("99999999999999999999.995", currencies[0], "en")).toContain("100,000,000,000,000,000,000.00");
  expect(() => formatFinanceAmount("NaN", currencies[0], "en")).toThrow();
  expect(canChartFinanceAmount("1234567890123456.78", 2)).toBe(false);
  expect(canChartFinanceAmount("40898.00", 2)).toBe(true);
 });
