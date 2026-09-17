import { z } from "zod";
import { planningAmount } from "./finance-planning";

export const projectStreams = ["design", "supervision", "contractor_bonus", "other"] as const;
export const projectContextSchema = z.object({
  projectId: z.uuid(), stream: z.enum(projectStreams),
  source: z.enum(["manual", "visit"]).default("manual"),
  contractorId: z.union([z.uuid(), z.literal("")]).default(""),
  visitId: z.union([z.uuid(), z.literal("")]).default(""),
  extraVisit: z.enum(["true", "false"]).default("false"),
}).refine((v) => v.source !== "visit" || (v.stream === "supervision" && Boolean(v.visitId)))
  .refine((v) => !v.contractorId || v.stream === "contractor_bonus");

export const projectTermsSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), revision: z.coerce.number().int().min(0),
  stream: z.enum(["design", "supervision"]), mode: z.enum(["design", "monthly", "per_visit", "custom", "stopped"]),
  amount: z.union([planningAmount, z.literal("")]), currency: z.string().regex(/^[A-Z]{3}$/),
  effectiveFrom: z.union([z.iso.date(), z.literal("")]).default(""),
  effectiveThrough: z.union([z.iso.date(), z.literal("")]).default(""),
  reason: z.string().trim().min(1).max(2000),
}).refine((v) => v.stream === "design" ? v.mode === "design" && Boolean(v.amount) && !v.effectiveFrom && !v.effectiveThrough
  : v.mode !== "design" && Boolean(v.effectiveFrom) && (["custom", "stopped"].includes(v.mode) || Boolean(v.amount)))
  .refine((v) => !v.effectiveThrough || v.effectiveThrough >= v.effectiveFrom)
  .refine((v) => v.mode !== "monthly" || (v.effectiveFrom.endsWith("-01") && (!v.effectiveThrough ||
    new Date(`${v.effectiveThrough}T00:00:00Z`).getUTCMonth() !== new Date(new Date(`${v.effectiveThrough}T00:00:00Z`).getTime() + 86400000).getUTCMonth())));

export const supervisionMonthsSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), from: z.iso.date(), through: z.iso.date(),
}).refine((v) => v.from.endsWith("-01") && v.through.endsWith("-01") && v.through >= v.from &&
  (Number(v.through.slice(0, 4)) - Number(v.from.slice(0, 4))) * 12 + Number(v.through.slice(5, 7)) - Number(v.from.slice(5, 7)) < 12);

export function financeProjectError(message: string) {
  if (message.includes("finance_project_month_once") || message.includes("finance_project_visit_once")) return "duplicateCharge";
  if (message === "finance_project_over_scheduled") return "overScheduled";
  if (message === "finance_project_currency_locked") return "currencyLocked";
  if (message === "finance_project_settled_terms_locked") return "settledLocked";
  if (message === "finance_supervision_generated_period" || message === "finance_supervision_effective_date") return "effectiveDate";
  if (message === "finance_supervision_range_invalid") return "monthRange";
  if (message === "finance_project_visit_not_billable") return "visitNotBillable";
  if (message === "finance_project_agreement_required") return "agreementRequired";
  return null;
}
