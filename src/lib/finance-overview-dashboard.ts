import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { forecastReportSchema } from "./finance-forecast";
import type { FinanceOverview } from "./finance-overview";
import { proportionalAmount } from "./finance-profitability";

// Overview presentation context; monetary amounts retain the canonical payment remainder.
export const overviewPaymentSchema = forecastReportSchema.shape.items.element.pick({
  id: true, description: true, direction: true, currency: true, amount: true,
  reportingAmount: true, dueDate: true, expectedDate: true, commitment: true, certainty: true,
}).extend({
  project: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  obligation: z.object({ id: z.uuid(), kind: z.string(), employee_name: z.string().nullable(), period_start: z.iso.date() }).nullable(),
  component: z.string().nullable(),
});
export type OverviewPayment = z.infer<typeof overviewPaymentSchema>;
type ForecastIssue = FinanceOverview["forecast"]["issues"][number];
export type OverviewAttentionIssue = Omit<ForecastIssue, "reason"> & { reason: ForecastIssue["reason"] | "stale_outgoing" };
export const overviewForecastDaysSchema = z.enum(["30", "90"]).catch("30");

export function overviewDateAfter(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function overviewAmountTotal(values: (string | null)[], digits: number): string | null {
  if (values.some(value => value === null)) return null;
  return financeAmountText(values.reduce<bigint>((sum, value) => sum + financeAmountUnits(value ?? "0", digits), BigInt(0)), digits);
}

export function overviewActualCash(flows: FinanceOverview["flows"], digits: number) {
  // planning_actuals normalizes each direction: refunds/reversals are contra amounts.
  // Its view already excludes transfers, stock openings and balance adjustments.
  const incoming = overviewAmountTotal(flows.filter(row => row.direction === "incoming").map(row => row.amount), digits);
  const outgoing = overviewAmountTotal(flows.filter(row => row.direction === "outgoing").map(row => row.amount), digits);
  return { incoming, outgoing, net: incoming === null || outgoing === null ? null
    : financeAmountText(financeAmountUnits(incoming, digits) - financeAmountUnits(outgoing, digits), digits),
    breakdown: (["operating", "financing", "owner_distribution"] as const).map(nature => ({ nature,
      incoming: overviewAmountTotal(flows.filter(row => row.nature === nature && row.direction === "incoming").map(row => row.amount), digits),
      outgoing: overviewAmountTotal(flows.filter(row => row.nature === nature && row.direction === "outgoing").map(row => row.amount), digits),
    })),
  };
}

export function overviewCashMonths(today: string) {
  const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 10));
}

export function overviewMonthlyCash(flows: FinanceOverview["flows"], today: string, digits: number) {
  return overviewCashMonths(today).map(month => {
    const rows = flows.filter(flow => flow.month.slice(0, 7) === month.slice(0, 7));
    const { incoming, outgoing, net } = overviewActualCash(rows, digits);
    return { month, incoming, outgoing, net, recorded: rows.length > 0 };
  });
}
export type OverviewCashMonth = ReturnType<typeof overviewMonthlyCash>[number];

export type OverviewDatedCash = Omit<FinanceOverview["flows"][number], "month"> & { financial_date: string };

export function overviewComparisonRange(period: FinanceOverview["period"], from: string, through: string) {
  const offset = period === "month" ? 1 : period === "3" ? 3 : 12;
  const shift = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(date.getUTCDate(), last));
    return first.toISOString().slice(0, 10);
  };
  return { from: shift(from), through: shift(through) };
}

export function overviewCashComparison(rows: OverviewDatedCash[], period: FinanceOverview["period"], from: string, through: string, digits: number) {
  const previous = overviewComparisonRange(period, from, through);
  const inRange = (start: string, end: string) => rows.filter(row => row.financial_date >= start && row.financial_date <= end)
    .map(row => ({ ...row, month: `${row.financial_date.slice(0, 7)}-01` }));
  const previousRows = inRange(previous.from, previous.through);
  const current = overviewActualCash(inRange(from, through), digits), baseline = overviewActualCash(previousRows, digits);
  const change = (key: "incoming" | "outgoing" | "net") => {
    const now = current[key], before = baseline[key];
    if (!previousRows.length || now === null || before === null) return null;
    const delta = financeAmountText(financeAmountUnits(now, digits) - financeAmountUnits(before, digits), digits);
    // A zero/negative baseline has no useful percentage interpretation; show the exact cash difference.
    const percent = financeAmountUnits(before, digits) > BigInt(0)
      ? proportionalAmount("100.00", financeAmountUnits(delta, digits), financeAmountUnits(before, digits), 2) : null;
    return { previous: before, delta, percent };
  };
  return { ...previous, received: change("incoming"), spent: change("outgoing"), net: change("net") };
}
export type OverviewCashComparison = ReturnType<typeof overviewCashComparison>;

export function overviewScheduledCash(payments: OverviewPayment[] | null, today: string, digits: number) {
  if (payments === null) return { incoming: null, outgoing: null, net: null };
  const { upcoming } = overviewPaymentBuckets(payments, today);
  const incoming = overviewAmountTotal(upcoming.filter(row => row.direction === "incoming").map(row => row.reportingAmount), digits);
  const outgoing = overviewAmountTotal(upcoming.filter(row => row.direction === "outgoing").map(row => row.reportingAmount), digits);
  return { incoming, outgoing, net: incoming === null || outgoing === null ? null
    : financeAmountText(financeAmountUnits(incoming, digits) - financeAmountUnits(outgoing, digits), digits) };
}

export function overviewSignedAmount(amount: string, direction: "received" | "spent" | "net") {
  const negative = amount.startsWith("-");
  const absolute = negative ? amount.slice(1) : amount;
  const sign = direction === "spent" ? negative ? "+" : "−" : negative ? "−" : direction === "net" && !/[1-9]/.test(amount) ? "" : "+";
  return { sign, absolute };
}

export function overviewAttentionGroups(payments: OverviewPayment[], issues: ForecastIssue[], today: string) {
  type Entry = { issue: OverviewAttentionIssue; reasons: OverviewAttentionIssue["reason"][]; payment?: OverviewPayment };
  type Group = { id: string; label: string; entries: Entry[] };
  const categories: Record<"dates" | "unscheduled" | "blockers", Map<string, Group>> = { dates: new Map(), unscheduled: new Map(), blockers: new Map() };
  const paymentById = new Map(payments.map(item => [item.id, item]));
  const add = (issue: OverviewAttentionIssue) => {
    const payment = issue.source === "expected" ? paymentById.get(issue.id) : undefined;
    const category = issue.reason === "undated" || issue.reason === "unscheduled_project" ? "unscheduled"
      : issue.reason === "stale_incoming" || issue.reason === "stale_outgoing" ? "dates" : "blockers";
    const key = payment?.project ? `project:${payment.project.id}` : payment?.obligation ? `obligation:${payment.obligation.id}` : `${issue.source}:${issue.id}`;
    const group = categories[category].get(key) ?? { id: key, label: payment?.project?.name || payment?.obligation?.employee_name || issue.label, entries: [] };
    const existing = group.entries.find(entry => entry.issue.source === issue.source && entry.issue.id === issue.id);
    if (existing) { if (!existing.reasons.includes(issue.reason)) existing.reasons.push(issue.reason); }
    else group.entries.push({ issue, reasons: [issue.reason], payment });
    categories[category].set(key, group);
  };
  // Recreate expected-item diagnostics from the full remainder list, avoiding duplicate forecast entries.
  issues.filter(issue => issue.source !== "expected" || !paymentById.has(issue.id)).forEach(add);
  for (const item of payments) {
    const issue = { source: "expected" as const, id: item.id, label: item.description, currency: item.currency, amount: item.amount, date: item.expectedDate ?? item.dueDate };
    if (!issue.date) add({ ...issue, reason: "undated" });
    else if (issue.date < today) add({ ...issue, reason: item.direction === "incoming" ? "stale_incoming" : "stale_outgoing" });
    if (item.reportingAmount === null) add({ ...issue, reason: "missing_fx" });
  }
  return { dates: [...categories.dates.values()], unscheduled: [...categories.unscheduled.values()], blockers: [...categories.blockers.values()] };
}

export function overviewPaymentBuckets(payments: OverviewPayment[], today: string) {
  const through = overviewDateAfter(today, 30);
  const overdue = payments.filter(item => item.dueDate !== null && item.dueDate < today);
  const upcoming = payments.filter(item => {
    const date = item.expectedDate ?? item.dueDate;
    return !(item.dueDate && item.dueDate < today) && date !== null && date >= today && date <= through;
  });
  return { through, overdue, upcoming,
    undated: payments.filter(item => !item.expectedDate && !item.dueDate),
    stale: payments.filter(item => !(item.dueDate && item.dueDate < today)
      && (item.expectedDate ?? item.dueDate ?? today) < today),
  };
}

export function overviewUncertainExpectations(payments: OverviewPayment[], issues: FinanceOverview["forecast"]["issues"], today: string) {
  // Undated receipts and missing payroll components have no amount/date to add.
  // Label the dated subtotal rather than infer when those unknowns will be paid.
  return {
    incoming: payments.some(item => item.direction === "incoming" && (!item.expectedDate && !item.dueDate
      || (item.expectedDate ?? item.dueDate ?? today) < today))
      || issues.some(issue => issue.reason === "unscheduled_project" || issue.reason === "ungenerated_supervision"),
    outgoing: payments.some(item => item.direction === "outgoing" && (!item.expectedDate && !item.dueDate
      || !(item.dueDate && item.dueDate < today) && (item.expectedDate ?? item.dueDate ?? today) < today))
      || issues.some(issue => issue.reason === "unknown_employer_cost" || issue.reason === "unknown_deductions" || issue.reason === "ungenerated_period"),
  };
}

export function overviewPaymentGroups(payments: OverviewPayment[], digits: number, overdue = false) {
  const groups = new Map<string, OverviewPayment[]>();
  for (const item of payments) {
    const key = item.obligation?.kind === "payroll" ? `payroll:${item.obligation.id}:${item.direction}` : item.id;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups].map(([id, items]) => {
    const dates = items.flatMap(item => (overdue ? item.dueDate : item.expectedDate ?? item.dueDate) ?? []).sort();
    return { id, items, first: items[0], from: dates[0] ?? null, to: dates.at(-1) ?? null,
      amount: overviewAmountTotal(items.map(item => item.reportingAmount), digits),
      estimated: items.some(item => item.certainty === "estimated" || item.commitment === "tentative"),
    };
  }).sort((a, b) => (a.from ?? "9999").localeCompare(b.from ?? "9999") || a.id.localeCompare(b.id));
}

export type OverviewPaymentGroup = ReturnType<typeof overviewPaymentGroups>[number];

export function overviewForecastWindow(data: FinanceOverview, days: "30" | "90", digits: number): FinanceOverview {
  const today = data.forecast.asOf;
  const through = [overviewDateAfter(today, Number(days)), data.forecast.through].sort()[0];
  // Crop/carry canonical closing balances. Do not reschedule or recalculate expected cash.
  const projection = data.projection.filter(point => point.date >= today && point.date <= through);
  if (projection.at(-1)?.date !== through) projection.push({ date: through, amount: projection.at(-1)?.amount ?? data.forecast.cashBase });
  const lowPoint = [{ date: today, amount: data.forecast.cashBase }, ...projection].reduce((low, point) =>
    financeAmountUnits(point.amount, digits) < financeAmountUnits(low.amount, digits) ? point : low);
  return { ...data, actualFrom: today, history: [], historyIncomplete: false, projection, lowPoint,
    forecast: { ...data.forecast, through, issues: data.forecast.issues.filter(issue => issue.date === null || issue.date <= through) },
  };
}

export function overviewIssueHref(issue: Pick<OverviewAttentionIssue, "source" | "id">) {
  if (issue.source === "expected") return `/finance/expected?item=${issue.id}`;
  if (issue.source === "project") return `/projects/${issue.id}?view=finance`;
  if (issue.source === "account") return "/finance/accounts";
  return "/finance/schedules";
}
