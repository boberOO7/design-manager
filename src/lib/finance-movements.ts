import { z } from "zod";
import type { FinanceAccount, FinanceCurrency } from "./finance";
import { projectCashSplitItemsSchema } from "./finance-profitability";

const decimal = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((value) => value.replace(",", "."));
const projectCashSplits = z.union([projectCashSplitItemsSchema, z.string().transform((value, context) => {
  let payload: unknown;
  try { payload = JSON.parse(value); }
  catch { context.addIssue({ code: "custom", message: "project_cash_split" }); return z.NEVER; }
  const parsed = projectCashSplitItemsSchema.safeParse(payload);
  if (!parsed.success) { context.addIssue({ code: "custom", message: "project_cash_split" }); return z.NEVER; }
  return parsed.data;
})]).optional();
export const financeRateSchema = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,10})?$/)
  .transform((value) => value.replace(",", ".")).refine((value) => Number(value)>0 && Number(value)<=1_000_000_000);
export const movementKinds = ["incoming", "outgoing", "transfer", "owner_withdrawal", "refund"] as const;
export const movementInputSchema = z.object({
  requestId: z.uuid(), kind: z.enum(movementKinds), date: z.iso.date(), accountId: z.uuid(),
  amount: decimal.refine((value) => Number(value)>0), nature: z.enum(["operating", "financing"]).default("operating"),
  projectReceiptSplits: projectCashSplits, projectRefundSplits: projectCashSplits,
  category: z.string().trim().min(1).max(120).default("Movement"), categoryId:z.union([z.uuid(),z.literal("")]).default(""),
  expectedItemId:z.union([z.uuid(),z.literal("")]).default(""),allocationAmount:z.union([decimal.refine((value)=>Number(value)>0),z.literal("")]).default(""),
  autoAllocate:z.union([z.boolean(),z.enum(["true","false"])]).default(false).transform((value)=>value===true||value==="true"),
  settlementFxMode:z.enum(["nbu","manual"]).default("nbu"),settlementManualRate:z.string().default(""),
  allocationIntent:z.union([z.boolean(),z.enum(["true","false"])]).default(false).transform((value)=>value===true||value==="true"),
  description: z.string().trim().max(2000).default(""),
  destinationId: z.union([z.uuid(), z.literal("")]).default(""),
  receivedAmount: z.union([decimal.refine((value) => Number(value)>0), z.literal("")]).default(""),
  fee: decimal.default("0"), relatedMovementId: z.union([z.uuid(), z.literal("")]).default(""),
}).superRefine((input, context) => {
  if (["incoming","outgoing","owner_withdrawal"].includes(input.kind) && !input.categoryId) context.addIssue({ code:"custom",message:"category" });
  if (input.expectedItemId && (!["incoming","outgoing","owner_withdrawal"].includes(input.kind) || (!input.allocationAmount&&!input.autoAllocate) || (input.allocationAmount&&input.autoAllocate))) context.addIssue({ code:"custom",message:"settlement" });
  if (!input.expectedItemId && (input.allocationAmount||input.autoAllocate)) context.addIssue({ code:"custom",message:"settlement" });
  if (input.projectReceiptSplits !== undefined && (input.kind !== "incoming" || input.nature !== "operating" || Boolean(input.expectedItemId))) context.addIssue({ code:"custom",message:"project_receipt" });
  if (input.projectRefundSplits !== undefined && input.kind !== "refund") context.addIssue({ code:"custom",message:"project_refund" });
  if (input.kind === "transfer" && (!input.destinationId || !input.receivedAmount || input.destinationId === input.accountId)) {
    context.addIssue({ code: "custom", message: "transfer" });
  }
  if (input.kind === "refund" && !input.relatedMovementId) context.addIssue({ code: "custom", message: "refund" });
  if (input.kind !== "refund" && input.relatedMovementId) context.addIssue({ code: "custom", message: "reference" });
  if (input.kind !== "transfer" && (input.destinationId || input.receivedAmount || Number(input.fee)!==0)) {
    context.addIssue({ code: "custom", message: "transfer" });
  }
});
export type MovementInput = z.infer<typeof movementInputSchema>;
export const correctionInputSchema = z.object({
  ...movementInputSchema.shape,
  movementId: z.uuid(),
  kind: z.enum([...movementKinds, "account_opening", "balance_adjustment"]),
  amount: z.string().trim().regex(/^-?\d{1,10}(?:[.,]\d{1,4})?$/).transform((value) => value.replace(",", ".")).refine((value) => Number(value) !== 0),
}).superRefine((input, context) => {
  if (["account_opening", "balance_adjustment"].includes(input.kind)) {
    if (input.destinationId || input.receivedAmount || Number(input.fee) !== 0 || input.relatedMovementId || input.expectedItemId || input.allocationAmount || input.autoAllocate) context.addIssue({ code: "custom", message: "balance" });
  } else if (!movementInputSchema.safeParse(input).success || input.expectedItemId || input.allocationAmount || input.autoAllocate) {
    context.addIssue({ code: "custom", message: "movement" });
  }
});
export const reversalInputSchema = z.object({ requestId: z.uuid(), movementId: z.uuid(), date: z.iso.date(), reason: z.string().trim().min(1).max(2000) });

export function validateMovementAccounts(input: MovementInput | z.infer<typeof correctionInputSchema>, accounts: FinanceAccount[], currencies: FinanceCurrency[]) {
  function validAmount(accountId: string, amount: string) {
    const account = accounts.find((item) => item.id === accountId && !item.archived_at);
    const currency = currencies.find((item) => item.code === account?.currency);
    return Boolean(currency && (amount.split(".")[1]?.length ?? 0) <= currency.minor_units);
  }
  if (!validAmount(input.accountId, input.amount) || !validAmount(input.accountId, input.fee)) return false;
  if (input.kind !== "transfer") return true;
  if (!validAmount(input.destinationId, input.receivedAmount)) return false;
  const from = accounts.find((item) => item.id === input.accountId);
  const to = accounts.find((item) => item.id === input.destinationId);
  return from?.currency !== to?.currency || Number(input.amount) === Number(input.receivedAmount);
}
