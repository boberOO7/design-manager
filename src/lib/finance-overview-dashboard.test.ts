import { describe, expect, it } from "vitest";
import { financeOverviewSchema } from "./finance-overview";
import { overviewActualCash, overviewAmountTotal, overviewAttentionGroups, overviewCashComparison, overviewComparisonRange, overviewSignedAmount, overviewScheduledCash, overviewMonthlyCash, overviewForecastWindow, overviewPaymentBuckets, overviewPaymentGroups, overviewUncertainExpectations, type OverviewPayment } from "./finance-overview-dashboard";

const today = "2026-10-17";
const payment = (id: string, overrides: Partial<OverviewPayment> = {}): OverviewPayment => ({
  id, description: "Base salary", direction: "outgoing", currency: "UAH", amount: "100.00", reportingAmount: "100.00",
  dueDate: "2026-10-25", expectedDate: null, commitment: "agreed", certainty: "fixed", project: null, obligation: null, component: null, ...overrides,
});
const payroll = (id: string) => ({ id, kind: "payroll", employee_name: "Architect", period_start: "2026-10-01" });

describe("Finance Overview cash presentation", () => {
  it("compares equivalent partial periods, including short months and leap years", () => {
    expect(overviewComparisonRange("month", "2026-10-01", today)).toEqual({ from: "2026-09-01", through: "2026-09-17" });
    expect(overviewComparisonRange("month", "2026-03-01", "2026-03-31")).toEqual({ from: "2026-02-01", through: "2026-02-28" });
    expect(overviewComparisonRange("3", "2026-08-01", today)).toEqual({ from: "2026-05-01", through: "2026-07-17" });
    expect(overviewComparisonRange("year", "2024-01-01", "2024-02-29")).toEqual({ from: "2023-01-01", through: "2023-02-28" });
    const actual = (financial_date: string, amount: string | null, direction: "incoming" | "outgoing" = "incoming") => ({ financial_date, amount, direction, nature: "operating" as const });
    const result = overviewCashComparison([
      actual("2026-09-15", "100"), actual("2026-09-16", "200", "outgoing"), actual("2026-09-20", "50000"),
      actual("2026-10-15", "150"), actual("2026-10-16", "50", "outgoing"),
    ], "month", "2026-10-01", today, 2);
    expect(result.received).toEqual({ previous: "100.00", delta: "50.00", percent: "50.00" });
    expect(result.spent).toEqual({ previous: "200.00", delta: "-150.00", percent: "-75.00" });
    expect(result.net).toEqual({ previous: "-100.00", delta: "200.00", percent: null });
    expect(overviewCashComparison([actual("2026-09-01", "0"), actual(today, "25")], "month", "2026-10-01", today, 2).received)
      .toEqual({ previous: "0.00", delta: "25.00", percent: null });
    expect(overviewCashComparison([actual("2026-09-01", null)], "month", "2026-10-01", today, 2).received).toBeNull();
    expect(overviewCashComparison([actual(today, "10")], "month", "2026-10-01", today, 2).received).toBeNull();
  });

  it("adds display signs without changing cash totals, including contra amounts", () => {
    expect(overviewSignedAmount("100.00", "received")).toEqual({ sign: "+", absolute: "100.00" });
    expect(overviewSignedAmount("100.00", "spent")).toEqual({ sign: "−", absolute: "100.00" });
    expect(overviewSignedAmount("-20.00", "spent")).toEqual({ sign: "+", absolute: "20.00" });
    expect(overviewSignedAmount("-20.00", "received")).toEqual({ sign: "−", absolute: "20.00" });
    expect(overviewSignedAmount("-20.00", "net")).toEqual({ sign: "−", absolute: "20.00" });
    expect(overviewSignedAmount("0.00", "net")).toEqual({ sign: "", absolute: "0.00" });
  });

  it("nets only dated outstanding payments, excludes overdue, and preserves missing valuations", () => {
    const rows = [payment("in", { direction: "incoming", reportingAmount: "1000.00" }), payment("out", { reportingAmount: "300.00" }),
      payment("overdue", { dueDate: "2026-10-01", expectedDate: "2026-10-25", reportingAmount: "10000.00" }),
      payment("undated", { dueDate: null, reportingAmount: "50000.00" })];
    expect(overviewScheduledCash(rows, today, 2)).toEqual({ incoming: "1000.00", outgoing: "300.00", net: "700.00" });
    expect(overviewScheduledCash([...rows, payment("unknown", { reportingAmount: null })], today, 2)).toMatchObject({ outgoing: null, net: null });
    expect(overviewScheduledCash(null, today, 2)).toEqual({ incoming: null, outgoing: null, net: null });
  });
  it("fills a rolling year across the year boundary using the exact same cash totals", () => {
    const flows = [
      { month: "2025-11-01", direction: "incoming", nature: "operating", amount: "9007199254740993.01" },
      { month: "2025-11-01", direction: "incoming", nature: "operating", amount: "-0.01" },
      { month: "2026-10-01", direction: "incoming", nature: "financing", amount: "200.00" },
      { month: "2026-10-01", direction: "outgoing", nature: "owner_distribution", amount: "100.00" },
      { month: "2026-10-01", direction: "outgoing", nature: "operating", amount: "-25.00" },
    ] satisfies Parameters<typeof overviewMonthlyCash>[0];
    const points = overviewMonthlyCash(flows, today, 2);
    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ month: "2025-11-01", incoming: "9007199254740993.00", net: "9007199254740993.00" });
    expect(points[1]).toMatchObject({ incoming: "0.00", outgoing: "0.00", recorded: false });
    expect(points.at(-1)).toMatchObject({ month: "2026-10-01", incoming: "200.00", outgoing: "75.00", net: "125.00" });
    expect(overviewAmountTotal(points.map(point => point.net), 2)).toBe(overviewActualCash(flows, 2).net);
    expect(overviewMonthlyCash([{ ...flows[0], amount: null }], today, 2)[0]).toMatchObject({ incoming: null, outgoing: "0.00", net: null });
  });

  it("groups diagnostics by source without treating an unscheduled date as an error", () => {
    const project = { id: "project-a", name: "Apartment" };
    const items = [
      payment("first", { project, direction: "incoming", dueDate: null }),
      payment("second", { project, direction: "incoming", dueDate: null }),
      payment("overdue", { project, direction: "incoming", dueDate: "2026-10-10" }),
      payment("replanned", { direction: "incoming", dueDate: "2026-10-10", expectedDate: "2026-10-20" }),
      payment("missing-rate", { reportingAmount: null }),
    ];
    const result = overviewAttentionGroups(items, [
      { source: "expected", id: "first", label: "Apartment", reason: "undated", currency: "UAH", amount: "100.00", date: null },
      { source: "project", id: "project-a", label: "Apartment", reason: "unscheduled_project", currency: "UAH", amount: "200.00", date: null },
      { source: "payroll", id: "employee", label: "Architect", reason: "unknown_employer_cost", currency: "UAH", amount: null, date: null },
    ], today);
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0].entries.map(entry => entry.issue.id)).toEqual(["project-a", "first", "second"]);
    expect(result.dates).toHaveLength(1);
    expect(result.dates[0].entries.map(entry => entry.issue.id)).toEqual(["overdue"]);
    expect(result.blockers).toHaveLength(2);
  });
  it("keeps cash directions, refunds, financing and owner withdrawals consistent with normalized planning_actuals", () => {
    const totals = overviewActualCash([
      { month: "2026-10-01", direction: "incoming", nature: "operating", amount: "1000.00" },
      { month: "2026-10-01", direction: "incoming", nature: "operating", amount: "-50.00" },
      { month: "2026-10-01", direction: "outgoing", nature: "operating", amount: "300.00" },
      { month: "2026-10-01", direction: "outgoing", nature: "operating", amount: "-25.00" },
      { month: "2026-10-01", direction: "incoming", nature: "financing", amount: "200.00" },
      { month: "2026-10-01", direction: "outgoing", nature: "owner_distribution", amount: "100.00" },
    ], 2);
    expect(totals).toMatchObject({ incoming: "1150.00", outgoing: "375.00", net: "775.00" });
    expect(totals.breakdown).toEqual([
      { nature: "operating", incoming: "950.00", outgoing: "275.00" },
      { nature: "financing", incoming: "200.00", outgoing: "0.00" },
      { nature: "owner_distribution", incoming: "0.00", outgoing: "100.00" },
    ]);
  });

  it("never turns missing valuation into zero and preserves large exact decimal totals", () => {
    expect(overviewAmountTotal(["9007199254740993.01", "0.02"], 2)).toBe("9007199254740993.03");
    expect(overviewAmountTotal(["20.00", null], 2)).toBeNull();
    expect(overviewActualCash([{ month: "2026-10-01", direction: "outgoing", nature: "operating", amount: null }], 2))
      .toMatchObject({ incoming: "0.00", outgoing: null, net: null });
    expect(overviewActualCash([], 2)).toMatchObject({ incoming: "0.00", outgoing: "0.00", net: "0.00" });
  });

  it("groups only structurally related payroll components, conserving all remainders", () => {
    const rows = [
      payment("salary-a", { obligation: payroll("employee-period-a"), component: "payout", reportingAmount: "800.00" }),
      payment("tax-a", { obligation: payroll("employee-period-a"), component: "deductions", reportingAmount: "200.00" }),
      payment("salary-b", { obligation: payroll("employee-period-b"), reportingAmount: "500.00" }),
      payment("other-identical-label", { reportingAmount: "25.00" }),
    ];
    const groups = overviewPaymentGroups(rows, 2);
    expect(groups).toHaveLength(3);
    expect(groups.find(group => group.items.length === 2)?.amount).toBe("1000.00");
    expect(overviewAmountTotal(groups.map(group => group.amount), 2)).toBe("1525.00");
    rows[1].reportingAmount = null;
    expect(overviewPaymentGroups(rows, 2).find(group => group.items.length === 2)?.amount).toBeNull();
  });

  it("separates contractual overdue, undated, stale and upcoming items without double counting", () => {
    const buckets = overviewPaymentBuckets([
      payment("overdue-future", { dueDate: "2026-10-16", expectedDate: "2026-10-25" }),
      payment("overdue-beyond-forecast", { dueDate: "2026-10-01", expectedDate: "2027-12-01" }),
      payment("undated", { dueDate: null }),
      payment("stale", { direction: "incoming", dueDate: null, expectedDate: "2026-10-16" }),
      payment("stale-payout", { expectedDate: "2026-10-16" }),
      payment("today", { expectedDate: today }),
      payment("boundary", { dueDate: "2026-11-16" }),
      payment("after", { dueDate: "2026-11-17" }),
    ], today);
    expect(buckets.overdue.map(item => item.id)).toEqual(["overdue-future", "overdue-beyond-forecast"]);
    expect(buckets.upcoming.map(item => item.id)).toEqual(["today", "boundary"]);
    expect(buckets.undated.map(item => item.id)).toEqual(["undated"]);
    expect(buckets.stale.map(item => item.id)).toEqual(["stale", "stale-payout"]);
  });

  it("does not present an empty dated subtotal as proof of no expected money when inputs are missing", () => {
    const unknown = { source: "payroll", id: "employee", label: "Architect", reason: "unknown_employer_cost", currency: "UAH", amount: null, date: null } as const;
    expect(overviewUncertainExpectations([], [unknown], today)).toEqual({ incoming: false, outgoing: true });
    expect(overviewUncertainExpectations([payment("undated-income", { direction: "incoming", dueDate: null })], [], today))
      .toEqual({ incoming: true, outgoing: false });
  });

  it("crops and carries canonical balances to matching rolling horizons, independent of history", () => {
    const report = financeOverviewSchema.parse({
      forecast: { version: 1, asOf: today, from: "2026-10-01", through: "2027-03-31", cutover: "2026-10-01", currency: "UAH", scenario: "confirmed", horizon: "6", fx: [], cashBase: "1000.00", cashIncomplete: false, comparisons: [], months: [], items: [],
        issues: [{ source: "schedule", id: "later", label: "Later period", reason: "ungenerated_period", currency: "UAH", amount: null, date: "2027-02-01" }] },
      period: "year", actualFrom: "2026-01-01", upcomingThrough: "2026-11-16", historyIncomplete: true,
      history: [{ date: "2026-10-01", amount: "900.00" }],
      projection: [{ date: today, amount: "900.00" }, { date: "2026-11-01", amount: "500.00" }, { date: "2026-12-01", amount: "-100.00" }, { date: "2027-03-31", amount: "-5000.00" }],
      lowPoint: { date: "2027-03-31", amount: "-5000.00" }, flows: [], netFlow: "0", accounts: [], receivables: [], receivableTotal: "0", receivablesIncomplete: false, outgoingTotal: "0", outgoingIncomplete: false, categories: [], requiredCurrencies: [],
    });
    const month = overviewForecastWindow(report, "30", 2);
    expect(month.forecast.through).toBe("2026-11-16");
    expect(month.projection.at(-1)).toEqual({ date: "2026-11-16", amount: "500.00" });
    expect(month.lowPoint).toEqual({ date: "2026-11-01", amount: "500.00" });
    expect(month.history).toEqual([]);
    expect(month.actualFrom).toBe(today);
    expect(month.forecast.issues).toEqual([]);
    const quarter = overviewForecastWindow(report, "90", 2);
    expect(quarter.forecast.through).toBe("2027-01-15");
    expect(quarter.projection.at(-1)?.amount).toBe("-100.00");
    expect(quarter.lowPoint).toEqual({ date: "2026-12-01", amount: "-100.00" });
    expect(report.lowPoint.amount).toBe("-5000.00");
  });
});
