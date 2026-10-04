import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";

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
export const laborDataSchema = z.object({ missingPeriods: z.array(laborMissingPeriodSchema).default([]), sources: z.array(laborSourceSchema), pools: z.array(laborPoolSchema), allocations: z.array(laborAllocationSchema),
  allocationHistory: z.array(z.object({id:z.uuid(),entryId:z.uuid(),revision:z.number().int(),method:z.literal("manual_management"),reason:z.string(),createdAt:z.string(),createdBy:z.uuid(),
    items:z.array(z.object({projectId:z.uuid(),amount:decimal}))})).default([]) });
export type FinanceLaborData = z.infer<typeof laborDataSchema>;
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
