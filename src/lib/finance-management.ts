import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";

export const managementClassificationSchema = z.enum(["revenue", "direct_cost", "labor", "overhead"]);
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const optionalId = z.union([z.uuid(), z.literal("")]).default("");
export const recognitionSourceSchema = z.object({
  kind: z.enum(["project_terms", "expected", "movement"]), sourceId: z.uuid(), label: z.string(), projectId: z.uuid().nullable(),
  classification: managementClassificationSchema, currency: z.string(), amount: decimal, gross: decimal, remaining: decimal,
  periodStart: z.iso.date().nullable(), periodEnd: z.iso.date().nullable(), version: z.number().int(),
});
export type RecognitionSource = z.infer<typeof recognitionSourceSchema>;
export const recognitionEntrySchema = z.object({
  id: z.uuid(), kind: z.enum(["recognition", "reversal", "adjustment"]), classification: managementClassificationSchema,
  source_kind: z.string(), terms_id: z.uuid().nullable(), expected_item_id: z.uuid().nullable(), movement_id: z.uuid().nullable(),
  trip_entry_id: z.uuid().nullable().default(null), obligation_id: z.uuid().nullable().default(null), employee_id: z.uuid().nullable().default(null), project_id: z.uuid().nullable(), category_id: z.uuid(), source_snapshot: z.record(z.string(), z.unknown()),
  period_start: z.iso.date(), period_end: z.iso.date(), recognized_on: z.iso.date(), description: z.string(),
  currency: z.string(), amount: decimal, vat_amount: decimal, gross_amount: decimal, reporting_currency: z.string(),
  reporting_amount: decimal.nullable(), fx_rate: decimal.nullable(), fx_source: z.string().nullable(), fx_effective_date: z.iso.date().nullable(),
  related_entry_id: z.uuid().nullable(), reason: z.string(), created_at: z.string(),
});
export type RecognitionEntry = z.infer<typeof recognitionEntrySchema>;
export const reportCoverageSchema = z.object({
  id: z.uuid(), project_id: z.uuid().nullable(), month: z.iso.date(), reviewed_through: z.iso.date(), revision: z.number().int(),
  revenue_reviewed: z.boolean(), direct_costs_reviewed: z.boolean(), labor_reviewed: z.boolean(), overhead_reviewed: z.boolean(), changed_since_review: z.boolean().default(false),
});
export type ReportCoverage = z.infer<typeof reportCoverageSchema>;
const positive = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform(v => v.replace(",", ".")).refine(v => /[1-9]/.test(v));
export const recognitionInputSchema = z.object({
  requestId: z.uuid(), sourceKind: recognitionSourceSchema.shape.kind, sourceId: z.uuid(), projectId: optionalId,
  classification: managementClassificationSchema, amount: positive, periodStart: z.iso.date(), periodEnd: z.iso.date(), date: z.iso.date(),
  description: z.string().trim().min(1).max(2000), reason: z.string().trim().min(1).max(2000),
  fxMode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().trim().default(""),
}).refine(v => v.periodStart <= v.date && v.date <= v.periodEnd);
export const coverageInputSchema = z.object({
  requestId: z.uuid(), projectId: optionalId, month: z.iso.date(), through: z.iso.date(), revision: z.coerce.number().int().min(0),
  revenue: z.enum(["true", "false"]), direct_costs: z.enum(["true", "false"]), labor: z.enum(["true", "false"]), overhead: z.enum(["true", "false"]),
  reason: z.string().trim().min(1).max(2000),
});
export const recognitionAdjustmentSchema = z.object({
  requestId: z.uuid(), entryId: z.uuid(), operation: z.enum(["cancel", "adjustment", "correction"]),
  amount: positive.optional(), date: z.iso.date().optional(), reason: z.string().trim().min(1).max(2000),
}).refine(v => v.operation !== "adjustment" || Boolean(v.amount && v.date));
export function parseManagementFilters(params: Record<string, string | string[] | undefined>, today: string) {
  const start = `${today.slice(0, 7)}-01`;
  const from = z.iso.date().catch(start).parse(params.from);
  const to = z.iso.date().catch(today).parse(params.to);
  const comparisonFrom = z.iso.date().optional().catch(undefined).parse(params.compareFrom);
  const comparisonTo = z.iso.date().optional().catch(undefined).parse(params.compareTo);
  return { from: from <= to ? from : start, to: from <= to ? to : today,
    compareFrom: comparisonFrom && comparisonTo && comparisonFrom <= comparisonTo ? comparisonFrom : undefined,
    compareTo: comparisonFrom && comparisonTo && comparisonFrom <= comparisonTo ? comparisonTo : undefined,
    projectId: z.uuid().optional().catch(undefined).parse(params.project), mode: params.report === "projects" ? "projects" as const : "pnl" as const,
    lifetime: params.scope === "lifetime" };
}
export type ManagementFilters = ReturnType<typeof parseManagementFilters>;

export function recognitionSourceHref(entry: Pick<RecognitionEntry, "project_id" | "expected_item_id" | "movement_id" | "source_snapshot"> & { obligation_id?: string | null; trip_entry_id?: string | null }) {
  if (entry.trip_entry_id) {
    const source = z.object({ trip: z.object({ id: z.uuid() }) }).safeParse(entry.source_snapshot);
    if (source.success) return `/finance/trips/${source.data.trip.id}`;
  }
  if (entry.obligation_id) return "/finance/schedules";
  if (entry.movement_id) return `/finance/movements?movement=${entry.movement_id}`;
  if (entry.expected_item_id) return `/finance/expected?item=${entry.expected_item_id}`;
  return entry.project_id ? `/projects/${entry.project_id}?view=finance` : "/finance/reports";
}

export function summarizeManagementEntries<T extends { classification: RecognitionEntry["classification"]; recognized_on: string; display_amount: string | null }>(entries: T[], from: string, to: string, digits: number) {
  const selected = entries.filter(e => e.recognized_on >= from && e.recognized_on <= to);
  const classes = managementClassificationSchema.options;
  const subtotal = (classification: z.infer<typeof managementClassificationSchema>) => {
    const rows = selected.filter(e => e.classification === classification);
    return { known: financeAmountText(rows.reduce((sum, e) => sum + (e.display_amount === null ? BigInt(0) : financeAmountUnits(e.display_amount, digits)), BigInt(0)), digits), missingFx: rows.filter(e => e.display_amount === null).length };
  };
  const totals = { revenue: subtotal("revenue"), direct_cost: subtotal("direct_cost"), labor: subtotal("labor"), overhead: subtotal("overhead") };
  const total = (classification: z.infer<typeof managementClassificationSchema>) => totals[classification];
  const knownResult = financeAmountText(financeAmountUnits(total("revenue").known, digits) - classes.filter(c => c !== "revenue").reduce((sum, c) => sum + financeAmountUnits(total(c).known, digits), BigInt(0)), digits);
  return { rows: selected, totals, knownResult, missingFx: selected.filter(e => e.display_amount === null).length };
}

export function managementDisplayEntries(entries: RecognitionEntry[], currency: string, digits: number, rates: ReadonlyMap<string, string | null>) {
  return entries.map(entry => {
    const day = entry.fx_effective_date ?? entry.recognized_on;
    const rate = rates.get(day);
    const display_amount = entry.reporting_amount === null ? null : entry.reporting_currency === currency ? entry.reporting_amount
      : rate ? convertFinanceDisplayAmount(entry.reporting_amount, rate, digits) : null;
    return { ...entry, display_amount };
  });
}

export function managementCoverageIssues(coverage: ReportCoverage[], from: string, to: string, projectId: string | null) {
  const issues: Array<{ month: string; classification: z.infer<typeof managementClassificationSchema> }> = [];
  let month = `${from.slice(0, 7)}-01`;
  while (month <= to) {
    const row = coverage.find(c => c.project_id === projectId && c.month === month);
    const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const monthEnd = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
    const through = to < monthEnd ? to : monthEnd;
    for (const classification of managementClassificationSchema.options) {
      if (projectId && classification === "overhead") continue;
      const reviewed = classification === "revenue" ? row?.revenue_reviewed : classification === "direct_cost" ? row?.direct_costs_reviewed : classification === "labor" ? row?.labor_reviewed : row?.overhead_reviewed;
      if (!reviewed || !row || row.reviewed_through < through) issues.push({ month, classification });
    }
    month = next.toISOString().slice(0, 10);
  }
  return issues;
}

// Report amount rows distinguish the economic book from manual project attribution.
// They never create or change a recognition entry.
export type ManagementAmountRow = {
  id: string; source_entry_id: string; allocation_id: string | null; project_id: string | null;
  classification: RecognitionEntry["classification"]; recognized_on: string; display_amount: string | null;
};
export function managementAmountRows(entries: ReturnType<typeof managementDisplayEntries>): ManagementAmountRow[] {
  return entries.map(e => ({ id: e.id, source_entry_id: e.id, allocation_id: null, project_id: e.project_id,
    classification: e.classification, recognized_on: e.recognized_on, display_amount: e.display_amount }));
}
