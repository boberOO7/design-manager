import { describe, expect, it } from "vitest";
import { formatCrmBudget, getCrmBudgetInputValue, parseCrmBudgetInput } from "@/lib/crm-budget";

describe("CRM lead budgets", () => {
  it.each([
    ["100000", "UAH", { amount: 100000, currency: "UAH" }],
    ["100 000", "USD", { amount: 100000, currency: "USD" }],
    ["2500", "EUR", { amount: 2500, currency: "EUR" }],
    ["3 000", "PLN", { amount: 3000, currency: "PLN" }],
  ] as const)("parses %s as %s", (input, currency, expected) => {
    expect(parseCrmBudgetInput(input, currency)).toEqual(expected);
  });

  it.each(["free text", "USD 2500", "$2,500", "10-20", "0", "-$20", "$$20"])("rejects ambiguous input %s", (input) => {
    expect(parseCrmBudgetInput(input, "UAH")).toBeNull();
  });

  it("formats every persisted currency consistently", () => {
    expect(formatCrmBudget(100000, "UAH")).toBe("100 000 ₴");
    expect(formatCrmBudget("2500.00", "USD")).toBe("$2 500");
    expect(formatCrmBudget(3000, "EUR")).toBe("€3 000");
    expect(formatCrmBudget(10000, "PLN")).toBe("10 000 zł");
    expect(getCrmBudgetInputValue({ amount: 2500, currency: "USD" })).toBe("2 500");
    expect(getCrmBudgetInputValue({ amount: null, currency: null })).toBe("");
  });
});
