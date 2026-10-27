import { z } from "zod";
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const expenseSourceSchema = z.object({ kind: z.enum(["expected", "movement"]), sourceId: z.uuid(), version: z.string(), label: z.string(),
  currency: z.string(), amount, gross: amount, consumed: amount, projectId: z.uuid().nullable(), scheduleId: z.uuid().nullable(),
  obligationId: z.uuid().nullable().optional(), categoryId: z.uuid(), projectEnabled: z.boolean() });
export const expenseSourceInfoSchema = z.object({ source: expenseSourceSchema.nullable(), recognitionStart: z.iso.date().nullable(),
  receipt: z.object({ id: z.uuid(), occurred_on: z.iso.date(), project_id: z.uuid().nullable() }).nullable(),
  entries: z.array(z.object({ id: z.uuid(), amount, currency: z.string(), reportingAmount: amount.nullable(), date: z.iso.date(), kind: z.string() })) });
export type ExpenseSourceInfo = z.infer<typeof expenseSourceInfoSchema>;
export const expenseCandidateSchema = z.object({ action: z.literal("recognize"), studioId: z.uuid(), sourceId: z.uuid(), policyId: z.uuid(),
  month: z.iso.date(), from: z.iso.date(), to: z.iso.date(), amount: amount.nullable(), currency: z.string().nullable(), reportingCurrency: z.string(),
  projectId: z.uuid().nullable(), label: z.string(), digest: z.string(), issue: z.string().nullable() });
export const expenseAutomationSchema = z.object({
  excludedScheduleIds: z.array(z.uuid()).optional(),
  configurationIssues: z.array(z.object({ scheduleId: z.uuid(), issue: z.string() })).optional(),
  projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
  policies: z.array(z.object({ id: z.uuid(), schedule_id: z.uuid(), revision: z.number(), coverage_from: z.iso.date().nullable().optional(), first_period: z.iso.date(), service_start: z.iso.date(),
    service_months: z.union([z.literal(1), z.literal(3), z.literal(12)]), effective_from: z.iso.date(), policy: z.enum(["service_days", "period_end", "manual"]), project_id: z.uuid().nullable() })),
  periods: z.array(z.object({ scheduleId: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date(), sourceId: z.uuid(), serviceMonths: z.number(), cashOnly: z.boolean() })),
  candidates: z.array(expenseCandidateSchema), missingFx: z.array(z.object({ id: z.uuid(), date: z.iso.date(), currency: z.string(), sourceId: z.uuid().nullable(), amount })),
});
export type ExpenseAutomation = z.infer<typeof expenseAutomationSchema>;
export const recurringArrangementInputSchema = z.object({
  policy: z.enum(["service_days", "period_end", "manual"]),
  serviceStart: z.union([z.iso.date(), z.literal("")]).default(""),
  projectId: z.union([z.uuid(), z.literal("")]).default(""),
});
export const expenseReceiptInputSchema = z.object({ requestId: z.uuid(), kind: z.enum(["expected", "movement"]), sourceId: z.uuid(), version: z.string().min(1),
  date: z.iso.date(), projectId: z.union([z.uuid(), z.literal("")]).default(""), confirmed: z.literal("true"), approveReviewed: z.enum(["true", "false"]).default("false"),
  fxMode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().default("") });
export function expenseErrorKey(code: string) {
  const keys: Record<string, string> = { finance_recognition_inactive: "inactive", finance_input_invalid: "invalid", finance_admin_required: "forbidden",
    finance_version_conflict: "version", finance_request_conflict: "version", finance_expense_history_protected: "history_protected",
    finance_expense_manual_history: "manual_history", finance_expense_source_project: "source_project", finance_expense_service_period_required: "service_period", finance_expense_source_invalid: "source_unavailable",
    finance_expense_source_owned: "source_owned", finance_payroll_source_review_required: "payroll_source_review", finance_payroll_cash_source: "payroll_cash_only",
    finance_project_invalid: "project", finance_fx_unavailable: "fx", finance_expense_source_unavailable: "source_unavailable" };
  return keys[code] ?? "save";
}
