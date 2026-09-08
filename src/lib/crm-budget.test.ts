import { describe, expect, it } from "vitest";
import { formatCrmBudget, getCrmBudgetInputValue, parseCrmBudgetInput } from "@/lib/crm-budget";

describe("CRM lead budgets", () => {
  it.each([
    ["100000", { amount: 100000, currency: "UAH" }],
    ["100 000", { amount: 100000, currency: "UAH" }],
    ["$2500", { amount: 2500, currency: "USD" }],
    ["2500 $", { amount: 2500, currency: "USD" }],
    ["100 000 ₴", { amount: 100000, currency: "UAH" }],
  ])("parses %s", (input, expected) => {
    expect(parseCrmBudgetInput(input)).toEqual(expected);
  });

  it.each(["free text", "USD 2500", "$2,500", "10-20", "0", "-$20", "$$20"])("rejects ambiguous input %s", (input) => {
    expect(parseCrmBudgetInput(input)).toBeNull();
  });

  it("formats persisted currency consistently and falls back to legacy notes", () => {
    expect(formatCrmBudget(100000, "UAH")).toBe("100 000 ₴");
    expect(formatCrmBudget("2500.00", "USD")).toBe("$2 500");
    expect(getCrmBudgetInputValue({ amount: null, currency: null, legacyNote: "about 5k" })).toBe("about 5k");
  });
});
