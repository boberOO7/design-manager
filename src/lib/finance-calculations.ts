import { z } from "zod";
import { managementClassificationSchema } from "./finance-management";
import { financeAmountUnits } from "./finance";
import type { HistoricalLaborDisplay } from "./finance-historical-labor";
import type { ProvisionalAmount } from "./finance-month-reporting";

const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const financialCalculationSchema = z.object({
  id: z.string(), sourceId: z.guid(), classification: managementClassificationSchema, date: z.iso.date(), projectId: z.uuid().nullable(),
  currency: z.string().nullable(), amount: money.nullable(), reportingAmount: money.nullable(), reportingCurrency: z.string(),
  valuationProvided: z.boolean().default(false),
  label: z.string(), issue: z.string().nullable(), href: z.string(),
});
export type FinancialCalculation = z.infer<typeof financialCalculationSchema>;

/** The payroll engine already subtracts recognized native amounts. No additional salary estimate is added. */
export function calculatedLaborAmounts(periods: HistoricalLaborDisplay[]): ProvisionalAmount[] {
  return periods.flatMap<ProvisionalAmount>(period => {
    if (period.remainingNative === "0" || period.remainingNative !== null && financeAmountUnits(period.remainingNative, 4) === BigInt(0)) return [];
    const common = { sourceId: period.sourceKey, classification: "labor" as const, recognized_on: period.periodEnd,
      href: "/finance/reports#labor", label: period.label, incomplete: period.issues.length > 0 };
    if (period.calculatedCost === null) return [{ ...common, id: `labor:${period.sourceKey}`, project_id: null, display_amount: null,
      incomplete: true, unresolved: period.issues.some(issue => ["fx_required", "display_fx"].includes(issue)) ? "fx" as const : "source" as const }];
    return [...period.allocations.map(allocation => ({ ...common, id: `labor:${period.sourceKey}:${allocation.projectId}`, project_id: allocation.projectId,
      display_amount: allocation.amount, unresolved: allocation.amount === null ? "fx" as const : null })),
    { ...common, id: `labor:${period.sourceKey}:studio`, project_id: null, display_amount: period.unattributedCost,
      unresolved: period.unattributedCost === null ? "source" as const : null }];
  });
}

export function sourceCalculationAmounts(calculations: FinancialCalculation[], values: ReadonlyMap<string, string | null>): ProvisionalAmount[] {
  return calculations.map(row => ({ id: row.id, sourceId: row.sourceId, classification: row.classification, recognized_on: row.date,
    project_id: row.projectId, display_amount: values.get(row.id) ?? null, href: row.href, label: row.label,
    incomplete: row.issue !== null || row.amount === null,
    unresolved: row.amount === null ? "source" : values.get(row.id) == null ? "fx" : null }));
}
