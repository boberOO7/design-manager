import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import { STANDARD_WORKWEEK } from "./workdays";

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const status = z.enum(["unknown", "estimated", "fixed"]);
export const laborSourceSchema = z.object({
  obligationId: z.uuid(), employeeId: z.uuid(), label: z.string(), kind: z.enum(["payroll", "bonus"]),
  periodStart: z.iso.date(), periodEnd: z.iso.date(), currency: z.string(), knownCost: decimal, recognizedCost: decimal, remainingCost: decimal,
  deductionsStatus: status, employerStatus: status, basis: z.enum(["net", "gross", "bonus"]), version: z.string().regex(/^[a-f0-9]{32}$/),
  snapshot: z.record(z.string(), z.unknown()), sourceReady: z.boolean(), canConfirm: z.boolean(),
});
export type LaborSource = z.infer<typeof laborSourceSchema>;
export const laborPoolSchema = z.object({
  id: z.uuid(), obligation_id: z.uuid(), employee_id: z.uuid(), description: z.string(), period_start: z.iso.date(), period_end: z.iso.date(), recognized_on: z.iso.date(),
  currency: z.string(), amount: decimal, reporting_currency: z.string(), available_reporting_amount: decimal.nullable(), allocated_amount: decimal,
  allocation_revision: z.number().int(), fx_rate: decimal.nullable(), fx_source: z.string().nullable(), fx_effective_date: z.iso.date().nullable(),
});
export type LaborPool = z.infer<typeof laborPoolSchema>;
export const laborAllocationSchema = z.object({ entry_id: z.uuid(), project_id: z.uuid(), amount: decimal, revision: z.number().int(), reason: z.string(), created_at: z.string() });
export const laborMissingPeriodSchema = z.object({ scheduleId: z.uuid(), label: z.string(), periodStart: z.iso.date(), periodEnd: z.iso.date() });
export const automaticLaborPeriodSchema = z.object({
  obligationId: z.uuid(), employeeId: z.uuid(), label: z.string(), periodStart: z.iso.date(), periodEnd: z.iso.date(), digest: z.string(),
  source: laborSourceSchema.nullable(), expectedMinutes: z.number().nonnegative(), completedDays: z.number().int(), requiredDays: z.number().int(),
  missingDates: z.array(z.iso.date()), projectIds: z.array(z.uuid()), issues: z.array(z.string()), manual: z.boolean(),
  status: z.enum(["applied", "pending_review", "exception", "manual", "pending", "provisional"]),
  accruedFrom: z.iso.date().optional(), asOf: z.iso.date().optional(),
  reportingCurrency: z.string().optional(),
  provisionalAllocations: z.array(z.object({ projectId: z.uuid(), amount: decimal })).optional(),
  provisionalDailyAllocations: z.array(z.object({ date: z.iso.date(), projectId: z.uuid(), amount: decimal })).optional(),
  provisionalRemainder: decimal.nullable().optional(),
  provisionalDailyRemainders: z.array(z.object({ date: z.iso.date(), amount: decimal })).optional(),
  provisionalFx: z.object({ rate: decimal, source: z.string(), effectiveDate: z.iso.date() }).nullable().optional(),
  shares: z.record(z.string(), z.union([decimal, z.number()])),
  proposedAllocations: z.array(z.object({ projectId: z.uuid(), amount: decimal })).optional(), proposedRemainder: decimal.nullable().optional(),
  proposalFx: z.object({ rate: decimal, source: z.string(), effectiveDate: z.iso.date() }).nullable().optional(),
  pools: z.array(z.object({ id: z.uuid(), available: decimal.nullable(), native: decimal, revision: z.number().int(),
    fx: z.object({ rate: decimal, source: z.string(), effectiveDate: z.iso.date() }).nullable() })),
});
export const laborDataSchema = z.object({ missingPeriods: z.array(laborMissingPeriodSchema).default([]), sources: z.array(laborSourceSchema), pools: z.array(laborPoolSchema), allocations: z.array(laborAllocationSchema),
  studioDailyMinutes: z.number().int().positive().optional(),
  sourceReview: z.object({ digest: z.string().regex(/^[a-f0-9]{32}$/), reviewed: z.boolean(), cashTermIds: z.array(z.uuid()), unresolvedTermIds: z.array(z.uuid()).optional(),
    recurring: z.array(z.object({ termId: z.uuid(), scheduleId: z.uuid(), name: z.string(), category: z.string(), amount: decimal,
      currency: z.string(), effectiveFrom: z.iso.date(), effectiveThrough: z.iso.date().nullable(), stoppedFrom: z.iso.date().nullable(), hasRecognizedExpense: z.boolean().optional() })),
  }).optional(),
  salaryConditions: z.array(z.object({ employeeId: z.uuid(), name: z.string(), termId: z.uuid(), effectiveFrom: z.iso.date(), effectiveThrough: z.iso.date().nullable(),
    currency: z.string(), amount: decimal, basis: z.enum(["net", "gross"]), payout: decimal.nullable(), deductions: decimal.nullable(),
    employerCost: decimal.nullable(), employerStatus: status,
  })).optional(),
  allocationHistory: z.array(z.object({id:z.uuid(),entryId:z.uuid(),revision:z.number().int(),method:z.enum(["manual_management", "automatic_work_tracking"]),reason:z.string(),createdAt:z.string(),createdBy:z.uuid(),
    items:z.array(z.object({projectId:z.uuid(),amount:decimal}))})).default([]),
  automation: z.object({ startsOn: z.iso.date(), internalProjectId: z.uuid().nullable() }).nullable().optional(),
  employees: z.array(z.object({ id: z.uuid(), name: z.string() })).optional(),
  capacity: z.array(z.object({ id: z.uuid(), employee_id: z.uuid().nullable(), effective_from: z.iso.date(), daily_minutes: z.number().int().positive(), weekdays: z.array(z.number().int()) })).optional(),
  automaticPeriods: z.array(automaticLaborPeriodSchema).optional(),
  projectIssues: z.array(z.object({ projectId: z.uuid(), employeeId: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date(), kind: z.string() })).optional(),
});
export type FinanceLaborData = z.infer<typeof laborDataSchema>;

/** Current operational settings are suggestions, never historical capacity evidence. */
export function laborCapacityDefaults(rows: NonNullable<FinanceLaborData["capacity"]>, studioDailyMinutes: number | undefined, date: string, employeeId: string | null = null) {
  const dated = rows.filter(row => row.effective_from <= date && (row.employee_id === null || row.employee_id === employeeId))
    .sort((a, b) => Number(b.employee_id !== null) - Number(a.employee_id !== null) || b.effective_from.localeCompare(a.effective_from))[0];
  return { dailyMinutes: dated?.daily_minutes ?? studioDailyMinutes, weekdays: dated?.weekdays ?? [...STANDARD_WORKWEEK], effectiveFrom: dated?.effective_from ?? null };
}
const positive = decimal.refine(v => financeAmountUnits(v, 4) > BigInt(0));
export const laborConfirmationInputSchema = z.object({
  requestId: z.uuid(), obligationId: z.uuid(), version: laborSourceSchema.shape.version, reason: z.string().trim().min(1).max(2000),
  fxMode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().trim().default(""),
});
export const laborAllocationItemsSchema = z.array(z.object({ projectId: z.uuid(), amount: positive }));
export const laborAllocationInputSchema = z.object({
  requestId: z.uuid(), entryId: z.uuid(), revision: z.coerce.number().int().min(0), reason: z.string().trim().min(1).max(2000),
  items: laborAllocationItemsSchema,
});
export function laborSourceIssues(sources: LaborSource[], from: string, to: string) {
  return sources.filter(s => s.periodStart <= to && s.periodEnd >= from).flatMap(source => {
    const issues: string[] = [];
    if (!source.sourceReady) issues.push("source_unavailable");
    if (source.basis === "net" && source.deductionsStatus !== "fixed") issues.push("deductions");
    if (source.employerStatus !== "fixed") issues.push("employer_cost");
    const remaining = financeAmountUnits(source.remainingCost, 4);
    if (remaining < BigInt(0)) issues.push("needs_reconciliation");
    else if (remaining > BigInt(0)) issues.push(source.canConfirm ? "unconfirmed" : "period_open");
    return issues.map(kind => ({ obligationId: source.obligationId, label: source.label, kind, periodStart: source.periodStart }));
  });
}
export function unallocatedLaborAmount(pool: LaborPool, digits: number) {
  return pool.available_reporting_amount === null ? null : financeAmountText(financeAmountUnits(pool.available_reporting_amount, digits) - financeAmountUnits(pool.allocated_amount, digits), digits);
}

/** Studio remainder is legitimate; only source/reporting problems affect margins. */
export function projectLaborIncomplete(data: FinanceLaborData, projectId: string, from: string, to: string) {
  if (data.projectIssues !== undefined) return data.projectIssues.some(issue => issue.projectId === projectId && issue.periodStart <= to && issue.periodEnd >= from);
  // Older payloads retain their existing completeness contract.
  return laborSourceIssues(data.sources, from, to).length > 0 || data.missingPeriods.some(period => period.periodStart <= to && period.periodEnd >= from);
}

export function hasProvisionalLabor(period: z.infer<typeof automaticLaborPeriodSchema>) {
  if (period.manual || !period.asOf) return false;
  if (period.status === "provisional") return period.pools.length === 0;
  return ["pending", "pending_review", "exception"].includes(period.status) && period.asOf === period.periodEnd
    && (!period.source?.sourceReady || financeAmountUnits(period.source.remainingCost, 4) > BigInt(0));
}

/** Provisional amounts never enter recognized rows; preliminary reports show them separately. */
export function projectProvisionalLabor(data: FinanceLaborData, projectId: string, from: string, to: string, displayCurrency: string, digits: number, rates: ReadonlyMap<string, string>) {
  let total = BigInt(0), unknown = 0, asOf: string | null = null, periods = 0;
  for (const period of data.automaticPeriods ?? []) {
    if (!hasProvisionalLabor(period) || !period.asOf
      || (period.accruedFrom ?? period.periodStart) > to || period.asOf < from || !period.projectIds.includes(projectId)) continue;
    periods++;
    if (!asOf || period.asOf > asOf) asOf = period.asOf;
    const items = period.provisionalDailyAllocations?.filter(item => item.projectId === projectId && item.date >= from && item.date <= to);
    const amount = items ? financeAmountText(items.reduce((sum, item) => sum + financeAmountUnits(item.amount, 4), BigInt(0)), 4)
      : period.provisionalAllocations?.find(item => item.projectId === projectId)?.amount;
    if (period.provisionalRemainder == null) { unknown++; continue; }
    const rate = period.reportingCurrency === displayCurrency ? "1" : rates.get(period.provisionalFx?.effectiveDate ?? period.asOf);
    // Reporting-currency amounts use the snapshot date for display FX.
    if (!rate && financeAmountUnits(amount ?? "0", 4) !== BigInt(0)) { unknown++; continue; }
    total += financeAmountUnits(convertFinanceDisplayAmount(amount ?? "0", rate ?? "1", digits), digits);
    if (period.issues.some(issue => ["unknown_deductions", "unknown_employer_cost"].includes(issue))
      || data.projectIssues?.some(issue => issue.projectId === projectId && issue.employeeId === period.employeeId
        && issue.periodStart <= to && issue.periodEnd >= from && issue.periodStart <= period.periodEnd && issue.periodEnd >= period.periodStart)) unknown++;
  }
  return { known: financeAmountText(total, digits), unknown, asOf, periods };
}
