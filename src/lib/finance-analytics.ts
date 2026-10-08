import { financeAmountText, financeAmountUnits } from "./finance";
import { managementCoverageIssues, summarizeManagementEntries } from "./finance-management";
import { laborSourceIssues, unallocatedLaborAmount, projectLaborIncomplete } from "./finance-labor";
import type { FinanceManagementData } from "@/data/queries/finance-management";
import type { FinanceOverview } from "./finance-overview";

export function financeAnalyticsPeriod(period: FinanceOverview["period"], today: string) {
  const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  if (period === "3") month.setUTCMonth(month.getUTCMonth() - 2);
  if (period === "year") month.setUTCMonth(0);
  return { from: month.toISOString().slice(0, 10), to: today };
}

export type AnalyticsMetric = { amount: string | null; incomplete: boolean };
const metric = (amount: string, incomplete: boolean, available = true): AnalyticsMetric => ({
  amount: !available || (incomplete && !/[1-9]/.test(amount)) ? null : amount, incomplete,
});
type AnalyticsInput = Pick<FinanceManagementData, "amountRows" | "coverage" | "labor" | "projectProfitability" | "today"> & {
  settings: Pick<NonNullable<FinanceManagementData["settings"]>, "recognition_start_month"> | null;
  currency: Pick<FinanceManagementData["currency"], "minor_units">;
  tripSources: Array<Pick<FinanceManagementData["tripSources"][number], "date" | "projectId">>;
  entries: Array<Pick<FinanceManagementData["entries"][number], "id" | "related_entry_id" | "recognized_on">>;
};

// Presentation only: retain the canonical recognized amounts and their coverage.
// A known subtotal is useful, but an incomplete zero is not evidence of no activity.
export function buildFinanceAnalytics(data: AnalyticsInput, from: string, to: string) {
  const start = data.settings?.recognition_start_month ?? null;
  const digits = data.currency.minor_units;
  const summarize = (from: string, to: string) => {
    const available = Boolean(start && start <= to);
    const effectiveFrom = start && from < start ? start : from;
    const historyIncomplete = !available || Boolean(start && from < start);
    const summary = summarizeManagementEntries(data.amountRows, effectiveFrom, to, digits);
    const coverage = available ? managementCoverageIssues(data.coverage, effectiveFrom, to, null) : [];
    const laborIncomplete = laborSourceIssues(data.labor.sources, effectiveFrom, to).length > 0
      || data.labor.missingPeriods.some(p => p.periodStart <= to && p.periodEnd >= effectiveFrom);
    const tripIncomplete = data.tripSources.some(trip => trip.date >= effectiveFrom && trip.date <= to);
    const classes = (["revenue", "direct_cost", "labor", "overhead"] as const).map(key => {
      const incomplete = historyIncomplete || summary.totals[key].missingFx > 0 || coverage.some(c => c.classification === key)
        || (key === "labor" && laborIncomplete) || (key === "direct_cost" && tripIncomplete);
      return { key, ...metric(summary.totals[key].known, incomplete, available) };
    });
    const costClasses = classes.filter(c => c.key !== "revenue");
    const costs = financeAmountText((["direct_cost", "labor", "overhead"] as const).reduce((sum, key) => sum + financeAmountUnits(summary.totals[key].known, digits), BigInt(0)), digits);
    const incomplete = classes.some(c => c.incomplete);
    return { revenue: classes[0], costs: metric(costs, costClasses.some(c => c.incomplete), available),
      result: metric(summary.knownResult, incomplete, available), expenses: costClasses,
      available, incomplete, hasEntries: summary.rows.length > 0 };
  };
  const summary = summarize(from, to);
  const months = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= to) {
    const month = cursor.toISOString().slice(0, 10);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const last = new Date(cursor.getTime() - 86400000).toISOString().slice(0, 10);
    months.push({ month, ...summarize(from > month ? from : month, to < last ? to : last), current: month.slice(0, 7) === data.today.slice(0, 7) });
  }
  const summaryStart = start && from < start ? start : from;
  const unallocatedLabor = data.labor.pools.some(pool => {
    const relevant = data.amountRows.some(row => row.source_entry_id === pool.id && row.recognized_on >= summaryStart && row.recognized_on <= to)
      || data.entries.some(entry => entry.related_entry_id === pool.id && entry.recognized_on >= summaryStart && entry.recognized_on <= to);
    if (!relevant) return false;
    const amount = unallocatedLaborAmount(pool, 4);
    return amount === null || financeAmountUnits(amount, 4) > BigInt(0);
  });
  const projects = data.projectProfitability.map(row => {
    // This ranking is a selected-period comparison, not a lifetime/final margin.
    // Reuse coverage/source rules on that period; older unknown history cannot
    // invalidate a reviewed later month. No labor allocation is inferred.
    const incomplete = !summary.available || Boolean(start && from < start) || projectLaborIncomplete(data.labor, row.projectId, summaryStart, to)
      || managementCoverageIssues(data.coverage, summaryStart, to, row.projectId).length > 0
      || row.period.missingFx > 0 || data.tripSources.some(trip => trip.projectId === row.projectId && trip.date >= summaryStart && trip.date <= to)
      || (data.labor.projectIssues === undefined && unallocatedLabor);
    return { id: row.projectId, name: row.name, result: metric(row.period.result, incomplete, summary.available),
      margin: incomplete ? null : row.period.margin };
  });
  const completeProjects = projects.filter(row => !row.result.incomplete).sort((a, b) => {
    const diff = financeAmountUnits(b.result.amount ?? "0", digits) - financeAmountUnits(a.result.amount ?? "0", digits);
    return diff === BigInt(0) ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id) : diff > BigInt(0) ? 1 : -1;
  });
  return { from, to, start, effectiveFrom: start && from < start ? start : from, ...summary, months, unallocatedLabor,
    completeProjects, incompleteProjects: projects.filter(row => row.result.incomplete).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}
export type FinanceAnalytics = ReturnType<typeof buildFinanceAnalytics>;

export function financeOverviewCashRisk(data: Pick<FinanceOverview, "projection"> & { forecast: Pick<FinanceOverview["forecast"], "asOf" | "cashBase" | "cashIncomplete" | "issues"> }) {
  const incomplete = data.forecast.cashIncomplete || data.forecast.issues.length > 0;
  // Use canonical base-currency points, before display conversion can round a
  // small negative balance to zero. Never recalculate expected-item timing.
  const firstDeficit = [{ date: data.forecast.asOf, amount: data.forecast.cashBase }, ...data.projection]
    .filter(p => p.amount.startsWith("-") && /[1-9]/.test(p.amount)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
  return { incomplete, firstDeficit: incomplete ? null : firstDeficit };
}
