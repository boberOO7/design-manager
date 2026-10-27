import { z } from "zod";

const amount = z.string().regex(/^\d+(?:\.\d{1,4})?$/);
const inputAmount = z.string().trim().regex(/^\d+(?:[.,]\d{1,4})?$/).transform(value => value.replace(",", "."));
export const earningMilestoneSchema = z.object({
  id: z.uuid(), project_id: z.uuid(), order_id: z.uuid(), terms_id: z.uuid(), title: z.string(),
  stage: z.enum(["stage_1", "stage_2", "stage_3", "stage_4"]).nullable(), net_amount: amount,
  percentage: amount.nullable(), condition: z.enum(["delivery", "acceptance"]), revision: z.number().int(), currency: z.string(),
  stale: z.boolean(), recognized: z.boolean(), earned: z.string().nullable(), exception: z.string().nullable(),
  events: z.array(z.object({ id: z.uuid(), kind: z.enum(["delivery", "acceptance"]), date: z.iso.date(), actor: z.uuid(), actorName: z.string(), recordedAt: z.string() })),
});
export const earningsReportSchema = z.object({ recognitionStart: z.iso.date().nullable().default(null), milestones: z.array(earningMilestoneSchema), orders: z.array(z.object({
  orderId: z.uuid(), projectId: z.uuid(), currency: z.string(), contract: amount, configured: z.boolean(), complete: z.boolean(), stale: z.boolean(),
  earned: z.string(), unearned: z.string(), hasRecognition: z.boolean(),
})) });
export type EarningsReport = z.infer<typeof earningsReportSchema>;
export const saveEarningMilestoneSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), orderId: z.uuid(), id: z.union([z.uuid(), z.literal("")]).default(""),
  revision: z.coerce.number().int().nonnegative(), intent: z.enum(["save", "remove"]).default("save"),
  title: z.string().trim().max(2000).default(""), stage: z.union([earningMilestoneSchema.shape.stage.unwrap(), z.literal("")]).default(""),
  condition: z.enum(["delivery", "acceptance"]).default("delivery"),
  netAmount: z.union([inputAmount, z.literal("")]).default(""), percentage: z.union([inputAmount, z.literal("")]).default(""),
}).refine(value => value.intent === "remove" || value.title.length > 0 && Boolean(value.netAmount) !== Boolean(value.percentage));
export const fulfillEarningMilestoneSchema = z.object({
  requestId: z.uuid(), milestoneId: z.uuid(), intent: z.enum(["fulfill", "retry"]),
  revision: z.coerce.number().int().nonnegative().default(0), kind: z.enum(["delivery", "acceptance"]).default("delivery"),
  date: z.union([z.iso.date(), z.literal("")]).default(""), confirmed: z.enum(["true", "false"]).default("false"),
}).refine(value => value.intent === "retry" || value.confirmed === "true" && value.date !== "");

export function earningCoverageIssues(report: EarningsReport, projectId?: string) {
  return report.orders.filter(order => (!projectId || order.projectId === projectId) && (!order.configured || !order.complete || order.stale
    || report.milestones.some(milestone => milestone.order_id === order.orderId && milestone.exception !== null)));
}

export function earningExceptionKey(code: string) {
  const keys: Record<string, string> = {
    finance_recognition_inactive: "inactive", finance_input_invalid: "boundary", finance_earning_manual_history: "manualHistory",
    finance_earning_plan_stale: "stale", finance_recognition_source_invalid: "order", finance_earning_over_contract: "overContract",
    finance_recognition_over_source: "overContract", finance_fx_unavailable: "fx", finance_earning_history_protected: "protected",
    finance_version_conflict: "version", finance_earning_plan_owned: "owned", finance_earning_event_conflict: "eventConflict",
    finance_earning_event_invalid: "invalid", finance_earning_order_invalid: "order", finance_request_conflict: "version",
  };
  return keys[code] ?? "save";
}
