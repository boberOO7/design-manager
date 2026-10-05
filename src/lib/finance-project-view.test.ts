import { describe, expect, it } from "vitest";
import { nextProjectPayment, projectOrderPaymentProgress, projectAgreementRemaining, projectContractSummary, projectFinanceTab, projectProfitPeriod } from "./finance-project-view";

describe("next contractual payment across confirmed orders", () => {
  const item = (id: string, order_id: string, expected_payment_date: string | null, due_date: string | null = null) => ({ id, order_id, expected_payment_date, due_date });

  it("finds the second order's unpaid payment when the first has no outstanding items", () => {
    const next = item("second-payment", "second", "2026-10-10");
    expect(nextProjectPayment([next], ["first", "second"])).toBe(next);
  });

  it("chooses the earliest effective date across orders, including overdue payments", () => {
    const overdue = item("overdue", "second", null, "2026-09-01");
    expect(nextProjectPayment([item("future", "first", "2026-10-20"), overdue, item("undated", "first", null)], ["first", "second"])).toBe(overdue);
  });

  it("uses expected date before due date and preserves saved schedule order for ties", () => {
    const first = item("first-saved", "second", "2026-10-10", "2026-09-01");
    expect(nextProjectPayment([first, item("second-saved", "first", null, "2026-10-10")], ["first", "second"])).toBe(first);
  });

  it("falls back to the first item in saved order/schedule order when every item is undated", () => {
    const first = item("saved-first", "second", null);
    expect(nextProjectPayment([first, item("saved-second", "first", null)], ["first", "second"])).toBe(first);
  });

  it("excludes draft/discarded orders and returns null only when confirmed orders have no candidates", () => {
    expect(nextProjectPayment([item("draft", "draft-order", "2026-01-01")], ["confirmed"])).toBeNull();
    expect(nextProjectPayment([], ["confirmed"])).toBeNull();
  });
});

describe("order payment progress presentation", () => {
  const total = (paid: string, closed = "0") => ({ contract_gross_amount: "100", contract_amount: "100", collected_amount: paid, closed_amount: closed });
  it("keeps paid, partial, unpaid and closed states distinct from commercial lifecycle", () => {
    expect(projectOrderPaymentProgress(total("0"), 2)).toEqual({ state: "unpaid", percent: 0 });
    expect(projectOrderPaymentProgress(total("45"), 2)).toEqual({ state: "partial", percent: 45 });
    expect(projectOrderPaymentProgress(total("100"), 2)).toEqual({ state: "paid", percent: 100 });
    expect(projectOrderPaymentProgress(total("98", "2"), 2)).toEqual({ state: "closed", percent: 100 });
  });
  it("clamps an overpayment only for the visual bar and handles unknown contractual value", () => {
    const overpaid = total("110");
    expect(projectOrderPaymentProgress(overpaid, 2)).toEqual({ state: "paid", percent: 100 });
    expect(overpaid.collected_amount).toBe("110");
    expect(projectOrderPaymentProgress(undefined, 2)).toEqual({ state: "unpaid", percent: 0 });
  });
});

describe("project finance presentation", () => {
  it("keeps unpaid agreement value regardless of whether the schedule is established", () => {
    expect(projectAgreementRemaining("7742.00", "0.00", 2)).toBe("7742.00");
    expect(projectAgreementRemaining("7742.00", "774.20", 2)).toBe("6967.80");
    expect(projectAgreementRemaining("7742.00", "7742.00", 2)).toBe("0.00");
    expect(projectAgreementRemaining(null, "0.00", 2)).toBeNull();
  });

  it("preserves precision and overpayments instead of clamping the balance", () => {
    expect(projectAgreementRemaining("1.001", "0.002", 3)).toBe("0.999");
    expect(projectAgreementRemaining("100", "110", 2)).toBe("-10.00");
  });

  it("subtracts explicit contractual closures separately from matched cash", () => {
    expect(projectAgreementRemaining("6000", "1999.98", 2, "0.02")).toBe("4000.00");
  });

  it("preserves expense links while explicit workspace navigation takes precedence", () => {
    expect(projectFinanceTab(undefined, "expenses")).toBe("expenses");
    expect(projectFinanceTab("result", "expenses")).toBe("result");
    expect(projectFinanceTab("invalid", "supervision")).toBe("payments");
  });

  it("defaults to lifetime and retains custom date links", () => {
    expect(projectProfitPeriod(undefined, undefined, undefined)).toBe("all");
    expect(projectProfitPeriod(undefined, "2026-10-01", undefined)).toBe("custom");
    expect(projectProfitPeriod("all", "2026-10-01", "2026-10-04")).toBe("all");
  });
});


describe("project order display summary", () => {
  const rows = [
    { currency: "USD", gross: "6000", paid: "2000", closed: "100" },
    { currency: "EUR", gross: "3500", paid: "1000", closed: "0" },
  ];
  it("uses one conversion basis and keeps closures out of paid", () => {
    expect(projectContractSummary(rows, { USD: "1", EUR: "1.1" }, 2)).toEqual({ gross: "9850.00", paid: "3100.00", remaining: "6650.00" });
    expect(projectContractSummary(rows, { USD: "1", EUR: "1.2" }, 2)).toEqual({ gross: "10200.00", paid: "3200.00", remaining: "6900.00" });
  });
  it("does not present a partial converted total when FX is unavailable", () => {
    expect(projectContractSummary(rows, { USD: "1", EUR: null }, 2)).toBeNull();
    expect(projectContractSummary([], {}, 2)).toBeNull();
  });
  it("retains precision and an overpaid balance", () => {
    expect(projectContractSummary([{currency:"KWD",gross:"1.001",paid:"1.003",closed:"0"}], {KWD:"1"}, 3)).toEqual({gross:"1.001",paid:"1.003",remaining:"-0.002"});
  });
});
