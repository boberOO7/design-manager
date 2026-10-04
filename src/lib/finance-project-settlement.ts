import { z } from "zod";
import { financeRateSchema, movementInputSchema } from "./finance-movements";

const amount = z.string().regex(/^\d+(?:\.\d{1,4})?$/);
export const settlementSnapshotSchema = z.object({
  planRevisionId: z.uuid().nullable(),
  orderId: z.uuid().nullable().optional(),
  items: z.array(z.object({ itemId: z.uuid(), version: z.number().int().nonnegative(), remaining: amount })),
});
export const settlementFxSnapshotSchema = z.object({ rate: financeRateSchema, source: z.enum(["identity", "nbu", "manual"]), effectiveDate: z.iso.date() });
const allocationSchema = z.array(z.object({ itemId: z.uuid(), amount })).refine(rows => new Set(rows.map(row => row.itemId)).size === rows.length);
function jsonField<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.string().transform((value, ctx) => {
    try {
      const result = schema.safeParse(JSON.parse(value));
      if (result.success) return result.data;
    } catch { /* Invalid JSON is a form error. */ }
    ctx.addIssue({ code: "custom", message: "settlement" });
    return z.NEVER;
  })]);
}
export const projectSettlementInputSchema = z.object({
  ...movementInputSchema.shape,
  projectId: z.uuid(),
  expectedItemId: z.uuid(),
  allocations: jsonField(allocationSchema),
  snapshot: jsonField(settlementSnapshotSchema),
  settlementFx: jsonField(settlementFxSnapshotSchema),
}).refine(input => input.kind === "incoming" && input.nature === "operating" && input.categoryId && !input.projectReceiptSplits && !input.projectRefundSplits && !input.relatedMovementId && !input.destinationId && !input.receivedAmount && Number(input.fee) === 0 && input.settlementFx.effectiveDate === input.date);

export const remainderReasons = ["fx_difference", "client_agreement", "other"] as const;
export const closeRemainderInputSchema = z.object({
  requestId: z.uuid(), itemId: z.uuid(), date: z.iso.date(), remaining: amount.refine(value => Number(value) > 0),
  reason: z.enum(remainderReasons), explanation: z.string().trim().max(2000).default(""),
  confirmed: z.literal("on"),
}).refine(input => input.reason !== "other" || input.explanation.length > 0);
export const reverseRemainderInputSchema = z.object({ requestId: z.uuid(), adjustmentId: z.uuid(), date: z.iso.date(), reason: z.string().trim().min(1).max(2000), confirmed: z.literal("on") });

export type ProjectSettlementOptions = {
  orderId: string | null;
  orderName: string | null;
  currency: string;
  candidates: { id: string; title: string; remaining: string; version: number; date: string | null }[];
  snapshot: z.infer<typeof settlementSnapshotSchema>;
};
