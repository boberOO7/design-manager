import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";

const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const historicalLaborPeriodSchema = z.object({
  sourceKey: z.string(), obligationId: z.uuid().nullable(), scheduleId: z.uuid().nullable(), termsId: z.uuid().nullable(), employeeId: z.uuid(), label: z.string(),
  periodStart: z.iso.date(), periodEnd: z.iso.date(), currency: z.string().nullable(), reportingCurrency: z.string().nullable(),
  knownNative: amount.nullable(), recognizedNative: amount, remainingNative: amount.nullable(),
  knownStudioCost: amount.nullable(), recognizedCost: amount.nullable(), calculatedCost: amount.nullable(), unattributedCost: amount.nullable(),
  allocations: z.array(z.object({ projectId: z.uuid(), amount })), projectIds: z.array(z.uuid()),
  expectedMinutes: z.number().nonnegative(), completedDays: z.number().int(), requiredDays: z.number().int(), missingDates: z.array(z.iso.date()), issues: z.array(z.string()),
  fx: z.object({ rate: amount, source: z.string(), effectiveDate: z.iso.date() }).nullable(),
});
export const historicalLaborReportSchema = z.object({ asOf: z.iso.date(), reportingCurrency: z.string().nullable(), periods: z.array(historicalLaborPeriodSchema) });
export type HistoricalLaborPeriod = z.infer<typeof historicalLaborPeriodSchema>;

export function historicalLaborDisplay(periods: HistoricalLaborPeriod[], currency: string, digits: number, rates: ReadonlyMap<string, string>) {
  return periods.map(period => {
    const rate = period.reportingCurrency === currency ? "1" : rates.get(period.fx?.effectiveDate ?? period.periodEnd);
    const convert = (value: string | null) => value === null ? null : financeAmountUnits(value, 4) === BigInt(0) ? financeAmountText(BigInt(0), digits)
      : rate ? convertFinanceDisplayAmount(value, rate, digits) : null;
    const issues = [...new Set([...period.issues, ...(!rate && [period.knownStudioCost, period.calculatedCost, period.recognizedCost].some(value => value !== null && financeAmountUnits(value, 4) !== BigInt(0)) ? ["display_fx"] : [])])];
    return { ...period, issues, knownStudioCost: convert(period.knownStudioCost), recognizedCost: convert(period.recognizedCost),
      calculatedCost: convert(period.calculatedCost), unattributedCost: convert(period.unattributedCost),
      allocations: period.allocations.map(allocation => ({ ...allocation, amount: convert(allocation.amount) })) };
  });
}
export type HistoricalLaborDisplay = ReturnType<typeof historicalLaborDisplay>[number];

export function historicalLaborSummary(periods: HistoricalLaborDisplay[], from: string, to: string, digits: number, projectId?: string) {
  const selected = periods.filter(period => period.periodEnd >= from && period.periodEnd <= to && (!projectId || period.projectIds.includes(projectId)));
  const subtotal = (values: Array<string | null>) => {
    const known = values.filter((value): value is string => value !== null);
    return known.length ? financeAmountText(known.reduce((sum, value) => sum + financeAmountUnits(value, digits), BigInt(0)), digits) : null;
  };
  const calculated = selected.map(period => !projectId ? period.calculatedCost : period.calculatedCost === null || period.issues.includes("missing_capacity")
    || period.issues.includes("manual_attribution") ? null : period.allocations.find(item => item.projectId === projectId)?.amount
      ?? (period.issues.includes("missing_reports") && financeAmountUnits(period.calculatedCost, 4) > BigInt(0) ? null : "0"));
  const issues = [...new Set(selected.flatMap(period => period.issues))];
  return { periods: selected.length, from: selected.at(0)?.periodStart ?? null, to: selected.at(-1)?.periodEnd ?? null,
    hasUnrecognized: selected.some(period => period.remainingNative === null || financeAmountUnits(period.remainingNative, 4) > BigInt(0)),
    known: subtotal(calculated), knownStudio: subtotal(selected.map(period => period.knownStudioCost)),
    recognized: subtotal(selected.map(period => period.recognizedCost)), unattributed: subtotal(selected.map(period => period.unattributedCost)),
    incomplete: issues.length > 0 || calculated.some(value => value === null), issues,
    completedDays: selected.reduce((sum, period) => sum + period.completedDays, 0), requiredDays: selected.reduce((sum, period) => sum + period.requiredDays, 0) };
}

export function historicalLaborCsvRows(periods: HistoricalLaborDisplay[], from: string, to: string, projectId?: string): Array<Array<string | null>> {
  return [["historical_labor_source", "employee", "period_start", "period_end", "known_native", "native_currency", "recognized", "calculated_unrecognized", "studio_unattributed", "project", "calculated_project_labor", "missing_inputs"],
    ...periods.filter(period => period.periodEnd >= from && period.periodEnd <= to && (!projectId || period.projectIds.includes(projectId))).flatMap(period => {
      const allocations = projectId ? period.allocations.filter(item => item.projectId === projectId) : period.allocations;
      return (allocations.length ? allocations : [{ projectId: null, amount: null }]).map(allocation => [period.sourceKey, period.label, period.periodStart, period.periodEnd,
        period.knownNative, period.currency, period.recognizedCost, period.calculatedCost, period.unattributedCost,
        allocation.projectId, allocation.amount, period.issues.join("; ")]);
    })];
}
