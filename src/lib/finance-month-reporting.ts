import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import { managementClassificationSchema, summarizeManagementEntries, type ManagementAmountRow, type RecognitionEntry } from "./finance-management";
import { hasProvisionalLabor, type FinanceLaborData } from "./finance-labor";
import type { ExpenseAutomation } from "./finance-expenses";

export const financeMonthSchema = z.object({
  month: z.iso.date(), through: z.iso.date(), closed: z.boolean(), digest: z.string().regex(/^[a-f0-9]{32}$/),
  revision: z.number().int(), confirmationId: z.uuid().nullable(), changed: z.boolean(),
  status: z.enum(["provisional", "needs_review", "confirmed"]),
  categories: z.record(managementClassificationSchema, z.enum(["automatic", "manual", "incomplete"])),
  exceptions: z.array(z.object({ category: managementClassificationSchema, sourceId: z.string(), label: z.string(), reason: z.string(), href: z.string() })),
});
export type FinanceMonth = z.infer<typeof financeMonthSchema>;
export const confirmFinanceMonthSchema = z.object({ requestId: z.uuid(), month: z.iso.date(), digest: financeMonthSchema.shape.digest,
  revision: z.coerce.number().int().nonnegative(), approved: z.literal("true") });

export type ProvisionalAmount = { id: string; sourceId: string; classification: "revenue" | "labor" | "direct_cost" | "overhead";
  recognized_on: string; project_id: string | null; display_amount: string | null; href: string; label: string; incomplete: boolean; unresolved: "source" | "fx" | null };

/** Elapsed studio capacity and unrecognized closed payroll; project shares require Worklog evidence. */
export function studioProvisionalLabor(labor: FinanceLaborData, entries: RecognitionEntry[], currency: string, digits: number, rates: ReadonlyMap<string, string>): ProvisionalAmount[] {
  const rows: ProvisionalAmount[] = [];
  for (const period of labor.automaticPeriods ?? []) {
    if (!hasProvisionalLabor(period) || !period.asOf) continue;
    const recognized = entries.filter(entry => entry.classification === "labor" && entry.obligation_id === period.obligationId);
    if (period.status === "provisional" && recognized.length) continue;
    // Closed previews are net of the same source history; reject a stale preview across recognition.
    if (period.source && financeAmountUnits(period.source.recognizedCost, 4)
      !== recognized.reduce((sum, entry) => sum + financeAmountUnits(entry.amount, 4), BigInt(0))) continue;
    const rate = period.reportingCurrency === currency ? "1" : rates.get(period.provisionalFx?.effectiveDate ?? period.asOf);
    const incomplete = period.status !== "provisional" || period.issues.length > 0 || period.missingDates.length > 0
      || period.provisionalRemainder == null;
    const daily: Array<{ date: string; amount: string; projectId: string | null }> = [
      ...(period.provisionalDailyAllocations ?? []).map(item => ({ ...item, projectId: item.projectId })),
      ...(period.provisionalDailyRemainders ?? []).map(item => ({ ...item, projectId: null })),
    ];
    if (period.provisionalRemainder == null) {
      rows.push({ id: `labor-${period.obligationId}-unknown`, sourceId: period.obligationId, classification: "labor", recognized_on: period.asOf,
        project_id: null, display_amount: null, href: "/finance/reports#labor", label: period.label, incomplete: true, unresolved: period.issues.includes("fx_required") ? "fx" : "source" });
      continue;
    }
    for (const [index, item] of daily.entries()) {
      if (item.date < (period.accruedFrom ?? period.periodStart) || item.date > period.asOf) continue;
      rows.push({ id: `labor-${period.obligationId}-${index}`, sourceId: period.obligationId, classification: "labor", recognized_on: item.date,
        project_id: item.projectId, display_amount: rate ? convertFinanceDisplayAmount(item.amount, rate, digits) : financeAmountUnits(item.amount, 4) === BigInt(0) ? financeAmountText(BigInt(0), digits) : null,
        href: "/finance/reports#labor", label: period.label, incomplete, unresolved: !rate && financeAmountUnits(item.amount, 4) !== BigInt(0) ? "fx" : null });
    }
  }
  return rows;
}

/** Candidates are source-backed service accrual deltas, already net of ledger amounts. */
export function provisionalExpenses(expenses: ExpenseAutomation, values: ReadonlyMap<string, string | null>): ProvisionalAmount[] {
  return expenses.candidates.filter(candidate => (candidate.issue === null || candidate.issue === "history_protected") && candidate.amount !== null && financeAmountUnits(candidate.amount, 4) > BigInt(0))
    .map(candidate => ({ id: `expense-${candidate.sourceId}-${candidate.month}`, sourceId: candidate.sourceId,
      classification: candidate.projectId ? "direct_cost" : "overhead", recognized_on: candidate.to, project_id: candidate.projectId,
      display_amount: values.get(`${candidate.sourceId}-${candidate.month}`) ?? null, href: `/finance/schedules?expense=${expenses.periods.find(period => period.sourceId === candidate.sourceId)?.scheduleId ?? ""}`, label: candidate.label, incomplete: candidate.issue !== null, unresolved: values.get(`${candidate.sourceId}-${candidate.month}`) == null ? "fx" : null }));
}

export function summarizeProvisionalReport(entries: ManagementAmountRow[], provisional: ProvisionalAmount[], from: string, to: string, digits: number, projectId: string | null = null) {
  const selected = provisional.filter(row => row.recognized_on >= from && row.recognized_on <= to && (!projectId || row.project_id === projectId));
  const recognized = summarizeManagementEntries(entries, from, to, digits);
  const pending = summarizeManagementEntries(selected, from, to, digits);
  const combined = summarizeManagementEntries([...entries, ...selected], from, to, digits);
  const unknownSources = selected.filter(row => row.unresolved === "source");
  pending.missingFx -= unknownSources.length;
  combined.missingFx -= unknownSources.length;
  for (const category of managementClassificationSchema.options) {
    const unknown = unknownSources.filter(row => row.classification === category).length;
    pending.totals[category].missingFx -= unknown;
    combined.totals[category].missingFx -= unknown;
  }
  return { recognized, pending, combined, sources: selected, unknownSources: unknownSources.length, incomplete: selected.some(row => row.incomplete) || combined.missingFx > 0 };
}
