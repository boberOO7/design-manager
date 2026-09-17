import { z } from "zod";
import { financeRateSchema } from "./finance-movements";

export const forecastOptionsSchema = z.object({
  horizon: z.enum(["3", "6", "year", "12"]).default("6"),
  scenario: z.enum(["confirmed", "planned"]).default("confirmed"),
});
export const budgetInputSchema = z.object({
  requestId: z.uuid(), categoryId: z.uuid(), year: z.coerce.number().int().min(1900).max(9998),
  revision: z.coerce.number().int().min(0), reason: z.string().trim().min(1).max(2000),
  months: z.array(z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform(v => v.replace(",", "."))).length(12),
});
export const forecastFxSchema = z.array(z.object({
  currency: z.string().regex(/^[A-Z]{3}$/), rate: financeRateSchema,
  source: z.enum(["manual", "nbu"]), effectiveDate: z.iso.date(),
})).max(200).refine(rows => new Set(rows.map(row => row.currency)).size === rows.length);
export type ForecastFx = z.infer<typeof forecastFxSchema>;
const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const direction = z.enum(["incoming", "outgoing"]);
const nature = z.enum(["operating", "financing", "owner_distribution"]);
const comparison = z.object({
  month: z.iso.date(), category_id: z.uuid().nullable(), category: z.string().nullable(), direction, nature,
  budget_revision_id: z.uuid().nullable(), budget_revision: z.number().nullable(), budget: money.nullable(),
  remaining: money, incomplete: z.boolean(),
});
// JSON RPC results are validated at the server boundary, never asserted into domain types.
const forecastBaseSchema = z.object({
  version: z.literal(1), asOf: z.iso.date(), from: z.iso.date(), through: z.iso.date(), cutover: z.iso.date(),
  currency: z.string(), scenario: z.enum(["confirmed", "planned"]), horizon: z.enum(["3", "6", "year", "12"]),
  fx: z.array(z.object({ currency: z.string(), rate: money, source: z.enum(["identity", "manual", "nbu"]), effectiveDate: z.iso.date() })),
  cashBase: money, cashIncomplete: z.boolean(),
  months: z.array(z.object({ month: z.iso.date(), remaining: money, closing: money })),
  items: z.array(z.object({
    id: z.uuid(), categoryId: z.uuid(), description: z.string(), direction, nature, currency: z.string(), amount: money,
    reportingAmount: money.nullable(), date: z.iso.date().nullable(), dueDate: z.iso.date().nullable(), expectedDate: z.iso.date().nullable(),
    commitment: z.enum(["agreed", "tentative"]), certainty: z.enum(["fixed", "estimated"]), version: z.number(),
    projectId: z.uuid().nullable(), stream: z.string().nullable(), component: z.string().nullable(), obligationKind: z.string().nullable(),
  })),
  issues: z.array(z.object({
    source: z.enum(["expected", "account", "payroll", "schedule", "project"]), id: z.string(), label: z.string(),
    reason: z.enum(["undated", "stale_incoming", "missing_fx", "unknown_employer_cost", "unknown_deductions", "ungenerated_period", "unscheduled_project", "ungenerated_supervision"]),
    currency: z.string(), amount: money.nullable(), date: z.iso.date().nullable(),
  })),
});
export const forecastReportSchema = forecastBaseSchema.extend({ comparisons: z.array(comparison.extend({ actual: money, full_period: money })) });
export const forecastSnapshotSchema = forecastBaseSchema.extend({ comparisons: z.array(comparison) });
export const snapshotComparisonSchema = z.array(z.object({ month: z.iso.date(), remaining: money, actual: money }));
export type ForecastReport = z.infer<typeof forecastReportSchema>;

export function forecastIssueHref(issue: ForecastReport["issues"][number]) {
  if (issue.source === "project") return `/projects/${issue.id}?view=finance`;
  if (issue.source === "schedule" || issue.source === "payroll") return "/finance/schedules";
  return issue.source === "account" ? "/finance" : "/finance/expected";
}
