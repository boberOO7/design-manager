import { describe, expect, it } from "vitest";
import { nextProjectPayment, scopeProjectFinance, projectPricingAreaComponents, projectPricingArea, projectPricingAreaCalculation, projectOrderPaymentProgress, projectAgreementRemaining, projectContractSummary, projectFinanceTab, projectProfitPeriod } from "./finance-project-view";
import { planningAmount } from "./finance-planning";
import { projectAreaValue } from "./finance-project-plan";

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

describe("direction financial scope", () => {
  const currencies = [{ code: "UAH", minor_units: 2 }, { code: "USD", minor_units: 2 }];
  const order = (id: string) => ({ id, name: id, studio_id: "studio", project_id: "project", is_default: false, status: "confirmed" as const, draft_plan: null, version: 1, created_by: "actor", updated_by: "actor", created_at: "2026-10-01", updated_at: "2026-10-01", confirmed_at: "2026-10-01", discarded_at: null });
  const amounts = (amount: string, paid: string, currency = "UAH") => ({ studio_id: "studio", project_id: "project", stream: "design", currency, contract_amount: amount, contract_net_amount: amount, contract_vat_amount: "0", contract_gross_amount: amount, scheduled_amount: amount, collected_amount: paid, closed_amount: "0", outstanding_amount: projectAgreementRemaining(amount, paid, 2) ?? "0", planned_amount: "0", unscheduled_amount: "0", scheduled_net_amount: amount, scheduled_vat_amount: "0", collected_net_amount: paid, collected_vat_amount: "0" });
  const project = {
    orders: [order("own"), order("extra"), order("shared"), order("other")],
    directionLinks: [{ order_id: "own", direction_id: "interior" }, { order_id: "extra", direction_id: "interior" }, { order_id: "shared", direction_id: "interior" }, { order_id: "shared", direction_id: "facade" }, { order_id: "other", direction_id: "facade" }],
    orderTotals: [{ ...amounts("1000", "150"), order_id: "own", payment_count: 2, has_payment_history: true }, { ...amounts("200", "37.50", "USD"), order_id: "extra", payment_count: 2, has_payment_history: true }, { ...amounts("3000", "1200"), order_id: "shared", payment_count: 2, has_payment_history: true }, { ...amounts("500", "0"), order_id: "other", payment_count: 1, has_payment_history: true }],
    totals: [amounts("4500", "1350"), amounts("200", "37.50", "USD")],
  };

  it("keeps shared schedules visible while counting only exclusive agreements in direction totals", () => {
    const scope = scopeProjectFinance(project, "interior", currencies);
    expect(scope.orders.map(order => order.id)).toEqual(["own", "extra", "shared"]);
    expect(scope.totals.map(total => [total.currency, total.contract_gross_amount, total.collected_amount])).toEqual([["UAH", "1000.00", "150.00"], ["USD", "200.00", "37.50"]]);
    expect(scope.orderTotals.find(total => total.order_id === "shared")?.contract_gross_amount).toBe("3000");
  });

  it("does not mutate or reconstruct consolidated totals when directions change", () => {
    const before = structuredClone(project);
    scopeProjectFinance(project, "interior", currencies);
    scopeProjectFinance(project, "facade", currencies);
    expect(project).toEqual(before);
    expect(scopeProjectFinance(project, "facade", currencies).totals[0].contract_gross_amount).toBe("500.00");
  });

  it("does not present a shared-only direction as owning the entire agreement", () => {
    const sharedOnly = { ...project, directionLinks: project.directionLinks.filter(link => link.order_id === "shared") };
    expect(scopeProjectFinance(sharedOnly, "interior", currencies).totals).toEqual([]);
    expect(scopeProjectFinance(sharedOnly, "interior", currencies).orders.map(order => order.id)).toEqual(["shared"]);
  });

  it("seeds the complete direction scope while leaving saved commercial revisions independent", () => {
    const source = { area: 200, directions: [{ id: "facade", area_m2: 200, complexity_coefficient: 0.35, area_components: [{ name: "Територія", actualArea: "30", coefficient: "0.10" }] }] };
    expect(projectPricingArea(source, ["facade"])).toBe(73);
    expect(projectPricingAreaCalculation(source, ["facade"])).toBeNull();
    expect(projectPricingAreaComponents(source, ["facade"], "Фасад")).toEqual([{ name: "Фасад", actualArea: "200", coefficient: "0.35" }, { name: "Територія", actualArea: "30", coefficient: "0.10" }]);
  });

  it("uses equivalent direction area for pricing and requires explicit area for a shared multi-direction scope", () => {
    const source = { area: 800, directions: [{ id: "interior", area_m2: 120, complexity_coefficient: 1.5 }, { id: "facade", area_m2: 800, complexity_coefficient: 0.15 }] };
    expect(projectPricingArea(source, ["facade"])).toBe(120);
    expect(projectPricingAreaCalculation(source, ["facade"])).toEqual({ actualArea: "800", coefficient: "0.15" });
    expect(projectPricingAreaCalculation(source, ["interior", "facade"])).toBeNull();
    expect(projectPricingAreaCalculation(source, ["unknown"])).toBeNull();
    expect(projectPricingAreaCalculation({ area: 800, directions: [] }, [])).toBeNull();
    expect(projectAreaValue(String(projectPricingArea(source, ["facade"])), "40", 2)).toBe("4800.00");
    expect(projectPricingArea(source, ["interior"])).toBe(180);
    expect(projectPricingArea(source, ["interior", "facade"])).toBeNull();
    expect(projectPricingArea(source, ["unknown"])).toBeNull();
    expect(projectPricingArea(source, [])).toBeNull();
  });

  it("uses the sole direction's coefficient without an explicit scope and retains the legacy area fallback", () => {
    expect(projectPricingArea({ area: 800, directions: [{ id: "facade", area_m2: 800, complexity_coefficient: 0.15 }] }, [])).toBe(120);
    expect(projectPricingArea({ area: 800, directions: [{ id: "interior", area_m2: 800, complexity_coefficient: 1 }] }, [])).toBe(800);
    expect(projectPricingArea({ area: 800, directions: [] }, [])).toBe(800);
  });

  it.each([[0.1, 0.2, 0.02], [123.45, 0.1234, 15.2337]])("fits equivalent area into the existing financial input precision", (area, coefficient, expected) => {
    const result = projectPricingArea({ area, directions: [{ id: "direction", area_m2: area, complexity_coefficient: coefficient }] }, ["direction"]);
    expect(result).toBe(expected);
    expect(planningAmount.safeParse(String(result)).success).toBe(true);
  });
});
