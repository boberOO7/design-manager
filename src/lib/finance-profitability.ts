import { z } from "zod";
import { planningAmount } from "./finance-planning";
const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const projectCashSplitItemsSchema = z.array(z.object({ projectId: z.uuid(), amount: planningAmount }));
export type ProjectCashSplitItem = z.infer<typeof projectCashSplitItemsSchema>[number];
export const projectCashInputSchema = z.object({ requestId: z.uuid(), movementId: z.uuid(), revision: z.coerce.number().int().min(0),
  items: projectCashSplitItemsSchema, reason: z.string().trim().min(1).max(2000) });
const optionalMoney = z.union([z.literal(""), z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/)]).transform(value => value === "" ? null : value.replace(",", "."));
export const projectCostEstimateInputSchema = z.object({ requestId: z.uuid(), projectId: z.uuid(), revision: z.coerce.number().int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/), date: z.iso.date(), directBudget: optionalMoney, laborBudget: optionalMoney,
  remainingDirect: optionalMoney, remainingLabor: optionalMoney, reason: z.string().trim().min(1).max(2000),
  fxMode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().default("") });
export const projectCostEstimateSchema = z.object({ id: z.uuid(), project_id: z.uuid(), revision: z.number().int(), currency: z.string(), as_of: z.iso.date(),
  direct_budget: money.nullable(), labor_budget: money.nullable(), remaining_direct: money.nullable(), remaining_labor: money.nullable(),
  reporting_currency: z.string(), fx_rate: money.nullable(), fx_source: z.string().nullable(), fx_effective_date: z.iso.date().nullable(),
  source_digest: z.string().nullable().default(null), reason: z.string(), created_at: z.string() });
export type ProjectCostEstimate = z.infer<typeof projectCostEstimateSchema>;
export const projectCashReceiptSchema = z.object({ id: z.uuid(), description: z.string(), date: z.iso.date(), currency: z.string(), original: money,
  remaining: money, unattributed: money, revision: z.number().int(), items: projectCashSplitItemsSchema });
export type ProjectCashReceipt = z.infer<typeof projectCashReceiptSchema>;
export const projectCashEventSchema = z.object({ movement_id: z.uuid(), project_id: z.uuid(), amount: money, financial_date: z.iso.date(), currency: z.string(),
  reporting_currency: z.string(), source_reporting_amount: money.nullable(), source_amount: money, fx_rate: money.nullable(), fx_source: z.string().nullable(),
  fx_effective_date: z.iso.date().nullable(), revision: z.number().int(), reason: z.string() });
export const projectContractSchema = z.object({ id: z.uuid(), project_id: z.uuid(), stream: z.string(), mode: z.string(), currency: z.string(),
  order_id: z.uuid().nullable().optional(), order_name: z.string().nullable().optional(),
  order_status: z.enum(["draft", "confirmed", "discarded"]).nullable().optional(),
  net_amount: money.nullable(), gross_amount: money.nullable(), effective_from: z.iso.date().nullable() });
export const projectMatchedSchema = z.object({ projectId: z.uuid(), stream: z.string(), currency: z.string(), amount: money });
export const projectReportingSchema = z.object({ receipts: z.array(projectCashReceiptSchema), events: z.array(projectCashEventSchema),
  estimates: z.array(projectCostEstimateSchema), contracts: z.array(projectContractSchema), matched: z.array(projectMatchedSchema),
  costStates: z.array(z.object({projectId:z.uuid(),digest:z.string(),latestDate:z.iso.date().nullable()})).default([]),
  cashHistory: z.array(z.object({id:z.uuid(),movementId:z.uuid(),revision:z.number().int(),reason:z.string(),createdAt:z.string(),createdBy:z.uuid(),actor:z.string(),currency:z.string(),description:z.string(),items:projectCashSplitItemsSchema})).default([]) });
export type ProjectReporting = z.infer<typeof projectReportingSchema>;

import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import { managementAmountRows, managementCoverageIssues, summarizeManagementEntries, type ManagementAmountRow, type ReportCoverage, type managementDisplayEntries } from "./finance-management";
import { laborSourceIssues, type FinanceLaborData } from "./finance-labor";

type DisplayEntry = ReturnType<typeof managementDisplayEntries>[number];
export function proportionalAmount(value: string, numerator: bigint, denominator: bigint, digits: number) {
  if (denominator <= BigInt(0)) throw new Error("Invalid monetary denominator");
  const product = financeAmountUnits(value, digits) * numerator;
  const sign = product < BigInt(0) ? -BigInt(1) : BigInt(1);
  return financeAmountText(sign * ((product * sign + denominator / BigInt(2)) / denominator), digits);
}
const add = (values: string[], digits: number) => financeAmountText(values.reduce((sum, value) => sum + financeAmountUnits(value, digits), BigInt(0)), digits);
const subtract = (a: string, b: string, digits: number) => financeAmountText(financeAmountUnits(a, digits) - financeAmountUnits(b, digits), digits);
export function projectAmountRows(entries: DisplayEntry[], labor: FinanceLaborData, digits: number): ManagementAmountRow[] {
  const rows = managementAmountRows(entries.filter(entry => entry.classification !== "labor" && entry.project_id));
  for (const pool of labor.pools) {
    const allocations = labor.allocations.filter(item => item.entry_id === pool.id).sort((a, b) => a.project_id.localeCompare(b.project_id));
    if (!allocations.length || pool.available_reporting_amount === null) continue;
    const denominator = financeAmountUnits(pool.available_reporting_amount, 4);
    if (denominator <= BigInt(0)) continue;
    for (const entry of entries.filter(e => e.id === pool.id || e.related_entry_id === pool.id)) {
      let cumulative = BigInt(0), previous = "0";
      for (const allocation of allocations) {
        cumulative += financeAmountUnits(allocation.amount, 4);
        const current = entry.display_amount === null ? null : proportionalAmount(entry.display_amount, cumulative, denominator, digits);
        rows.push({ id: `${entry.id}:${allocation.project_id}:${allocation.revision}`, source_entry_id: entry.id,
          allocation_id: pool.id, project_id: allocation.project_id, classification: "labor", recognized_on: entry.recognized_on,
          display_amount: current === null ? null : subtract(current, previous, digits) });
        previous = current ?? "0";
      }
    }
  }
  return rows;
}
export function projectCashDisplayEvents(events: ProjectReporting["events"], currency: string, digits: number, rates: ReadonlyMap<string, string>) {
  const output: Array<ProjectReporting["events"][number] & { display_amount: string | null }> = [];
  for (const movement of new Set(events.map(e => e.movement_id))) {
    const parts = events.filter(e => e.movement_id === movement).sort((a, b) => a.project_id.localeCompare(b.project_id));
    const source = parts[0], day = source.fx_effective_date ?? source.financial_date;
    const rate = source.reporting_currency === currency ? "1" : rates.get(day);
    const total = source.source_reporting_amount === null || !rate ? null : convertFinanceDisplayAmount(source.source_reporting_amount.replace(/^-/, ""), rate, digits);
    const denominator = financeAmountUnits(source.source_amount, 4);
    let cumulative = BigInt(0), previous = "0";
    for (const part of parts) {
      cumulative += financeAmountUnits(part.amount, 4);
      const current = total === null ? null : proportionalAmount(total, cumulative, denominator, digits);
      output.push({ ...part, display_amount: current === null ? null : subtract(current, previous, digits) });
      previous = current ?? "0";
    }
  }
  return output;
}
export function estimateDisplayAmounts(estimate: ProjectCostEstimate | null, currency: string, baseDigits: number, digits: number, rates: ReadonlyMap<string, string>) {
  const convert = (value: string | null | undefined) => {
    if (value === null || value === undefined || !estimate || estimate.fx_rate === null) return null;
    const base = convertFinanceDisplayAmount(value, estimate.fx_rate, baseDigits);
    const rate = estimate.reporting_currency === currency ? "1" : rates.get(estimate.fx_effective_date ?? estimate.as_of);
    return rate ? convertFinanceDisplayAmount(base, rate, digits) : null;
  };
  return { direct_budget: convert(estimate?.direct_budget), labor_budget: convert(estimate?.labor_budget), remaining_direct: convert(estimate?.remaining_direct), remaining_labor: convert(estimate?.remaining_labor) };
}
// Integer ratio in percentage units; no floating point money or unknown-as-zero.
function margin(result: string, revenue: string, digits: number) {
  const denominator = financeAmountUnits(revenue, digits);
  if (denominator <= BigInt(0)) return null;
  const n = financeAmountUnits(result, digits) * BigInt(10000);
  const sign = n < BigInt(0) ? -BigInt(1) : BigInt(1);
  return financeAmountText(sign * ((n * sign + denominator / BigInt(2)) / denominator), 2);
}
export function buildProjectProfitability(input: {
  projects: Array<{ id: string; name: string; startsOn: string | null }>; entries: DisplayEntry[]; projectRows: ManagementAmountRow[];
  labor: FinanceLaborData; coverage: ReportCoverage[]; reporting: ProjectReporting; cash: ReturnType<typeof projectCashDisplayEvents>;
  from: string; to: string; start: string | null; today: string; currency: string; digits: number; baseDigits: number;
  rates: ReadonlyMap<string, string>; referenceRates: ReadonlyMap<string, string>; pendingTrips?: Array<{projectId:string|null;date:string}>;
}) {
  const { entries, projectRows, digits } = input;
  return input.projects.map(project => {
    const rows = projectRows.filter(row => row.project_id === project.id);
    const summarize = (from: string, to: string) => {
      const summary = summarizeManagementEntries(rows, from, to, digits);
      const tripRows = summary.rows.filter(row => entries.find(e => e.id === row.source_entry_id)?.trip_entry_id);
      return { revenue: summary.totals.revenue.known, directCost: summary.totals.direct_cost.known, labor: summary.totals.labor.known,
        tripCost: add(tripRows.map(row => row.display_amount ?? "0"), digits), result: summary.knownResult,
        margin: margin(summary.knownResult, summary.totals.revenue.known, digits), missingFx: summary.missingFx };
    };
    const cash = input.cash.filter(row => row.project_id === project.id);
    const received = (from: string, to: string) => {
      const selected = cash.filter(row => row.financial_date >= from && row.financial_date <= to);
      return selected.some(row => row.display_amount === null) ? null : add(selected.map(row => row.display_amount ?? "0"), digits);
    };
    const contracts = input.reporting.contracts.filter(row => row.project_id === project.id && (!row.order_status || row.order_status === "confirmed"));
    const finite = contracts.filter(row => row.mode === "design");
    const agreedValue = (key: "net_amount" | "gross_amount") => {
      if (!finite.length) return null;
      const values = finite.map(row => {
        const value = row[key], rate = row.currency === input.currency ? "1" : input.referenceRates.get(row.currency);
        return value === null || !rate ? null : convertFinanceDisplayAmount(value, rate, digits);
      });
      return values.some(value => value === null) ? null : add(values.filter((value): value is string => value !== null), digits);
    };
    const estimate = input.reporting.estimates.filter(row => row.project_id === project.id).sort((a, b) => b.revision - a.revision)[0] ?? null;
    const estimateDisplay = estimateDisplayAmounts(estimate, input.currency, input.baseDigits, digits, input.rates);
    const lifetime = summarize(input.start ?? input.today, input.today);
    const costState = input.reporting.costStates.find(state => state.projectId === project.id);
    const estimateStale = Boolean(estimate && (!estimate.source_digest || estimate.source_digest !== costState?.digest || (costState?.latestDate && costState.latestDate > estimate.as_of)));
    const budgetVariance = { direct: estimateDisplay.direct_budget === null ? null : subtract(estimateDisplay.direct_budget, lifetime.directCost, digits),
      labor: estimateDisplay.labor_budget === null ? null : subtract(estimateDisplay.labor_budget, lifetime.labor, digits) };
    const agreedNet = agreedValue("net_amount");
    const designRevenue = entries.filter(row => row.project_id === project.id && row.classification === "revenue"
      && (row.source_kind === "project_terms" || row.source_snapshot.stream === "design"));
    // Older singleton report payloads did not expose order ownership. They remain
    // unambiguous only when there is exactly one contractual source.
    const belongsTo = (row: DisplayEntry, contract: typeof finite[number]) => contract.order_id
      ? row.order_id === contract.order_id || (!row.order_id && row.terms_id === contract.id)
      : finite.length === 1 && !row.order_id;
    const completeRevenue = finite.length > 0 && contracts.length === finite.length
      && designRevenue.every(row => finite.some(contract => belongsTo(row, contract)));
    const coverageGaps = input.start && input.to >= input.start ? managementCoverageIssues(input.coverage, input.from < input.start ? input.start : input.from, input.to, project.id).length : 0;
    const pendingTripCount = (input.pendingTrips ?? []).filter(trip => trip.projectId === project.id && trip.date <= input.today).length;
    const historyIncomplete = !input.start || !project.startsOn || project.startsOn < input.start || input.from < input.start;
    const laborIncomplete = laborSourceIssues(input.labor.sources, input.start ?? input.today, input.today).length > 0 || input.labor.missingPeriods.length > 0;
    // Preserve recognized revenue's historical valuation. Only unperformed agreed
    // native services use the explicitly dated contract reference assumption.
    const remainingValues = finite.map(design => {
      const recognizedDesign = designRevenue.filter(row => belongsTo(row, design));
      const remainingNative = design.net_amount !== null && recognizedDesign.every(row => row.currency === design.currency)
        ? subtract(design.net_amount, add(recognizedDesign.map(row => row.amount), 4), 4) : null;
      const referenceRate = design.currency === input.currency ? "1" : input.referenceRates.get(design.currency);
      return remainingNative !== null && referenceRate && financeAmountUnits(remainingNative, 4) >= BigInt(0)
        ? convertFinanceDisplayAmount(remainingNative, referenceRate, digits) : null;
    });
    const remainingRevenue = completeRevenue && remainingValues.every(value => value !== null)
      ? add(remainingValues.filter((value): value is string => value !== null), digits) : null;
    const targetRevenue = remainingRevenue === null ? null : add([lifetime.revenue, remainingRevenue], digits);
    const finalResult = completeRevenue && targetRevenue !== null && !estimateStale && estimateDisplay.remaining_direct !== null && estimateDisplay.remaining_labor !== null
      && lifetime.missingFx === 0 && pendingTripCount === 0 && !historyIncomplete && !laborIncomplete && coverageGaps === 0
      && input.start !== null && managementCoverageIssues(input.coverage, input.start, input.today, project.id).length === 0
      ? subtract(targetRevenue, add([lifetime.directCost, lifetime.labor, estimateDisplay.remaining_direct, estimateDisplay.remaining_labor], digits), digits) : null;
    return { projectId: project.id, name: project.name, startsOn: project.startsOn, period: summarize(input.from, input.to), lifetime,
      received: { period: received(input.from, input.to), lifetime: received("1900-01-01", input.today) },
      agreed: { net: agreedNet, gross: agreedValue("gross_amount"), complete: completeRevenue, referenceDate: input.today },
      contracts, matched: input.reporting.matched.filter(row => row.projectId === project.id), estimate, estimateDisplay, estimateStale, budgetVariance,
      finalMargin: finalResult === null || targetRevenue === null ? null : margin(finalResult, targetRevenue, digits), pendingTripCount, coverageGaps, historyIncomplete, laborIncomplete };
  });
}
