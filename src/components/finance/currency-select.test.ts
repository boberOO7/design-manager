import { describe, expect, it } from "vitest";
import type { FinanceCurrency } from "@/lib/finance";
import { groupFinanceCurrencies } from "./currency-select";

const currencies = ["EUR", "GBP", "JPY", "PLN", "UAH", "USD"].map((code) => ({ code, minor_units: code === "JPY" ? 0 : 2 }) satisfies FinanceCurrency);

describe("Finance currency presentation", () => {
  it("prioritizes an uncommon reporting currency without duplicating common currencies", () => {
    const groups = groupFinanceCurrencies(currencies, "GBP");
    expect(groups.reporting.map(({ code }) => code)).toEqual(["GBP"]);
    expect(groups.common.map(({ code }) => code)).toEqual(["UAH", "USD", "EUR", "PLN"]);
    expect(groups.other.map(({ code }) => code)).toEqual(["JPY"]);
  });

  it("moves a common reporting currency to the front of the common group", () => {
    const groups = groupFinanceCurrencies(currencies, "EUR");
    expect(groups.reporting).toEqual([]);
    expect(groups.common.map(({ code }) => code)).toEqual(["EUR", "UAH", "USD", "PLN"]);
    expect(groups.other.map(({ code }) => code)).toEqual(["GBP", "JPY"]);
  });
});
