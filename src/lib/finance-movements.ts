import { z } from "zod";
import type { FinanceAccount, FinanceCurrency } from "./finance";

const decimal = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((value) => value.replace(",", "."));
export const financeRateSchema = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,10})?$/)
  .transform((value) => value.replace(",", ".")).refine((value) => Number(value)>0 && Number(value)<=1_000_000_000);
export const movementKinds = ["incoming", "outgoing", "transfer", "owner_withdrawal", "refund"] as const;
export const movementInputSchema = z.object({
  requestId: z.uuid(), kind: z.enum(movementKinds), date: z.iso.date(), accountId: z.uuid(),
  amount: decimal.refine((value) => Number(value)>0), nature: z.enum(["operating", "financing"]).default("operating"),
  category: z.string().trim().min(1).max(120).default("Movement"), categoryId:z.union([z.uuid(),z.literal("")]).default(""),
  expectedItemId:z.union([z.uuid(),z.literal("")]).default(""),allocationAmount:z.union([decimal.refine((value)=>Number(value)>0),z.literal("")]).default(""),
  allocationIntent:z.union([z.boolean(),z.enum(["true","false"])]).default(false).transform((value)=>value===true||value==="true"),
  description: z.string().trim().max(2000).default(""),
  destinationId: z.union([z.uuid(), z.literal("")]).default(""),
  receivedAmount: z.union([decimal.refine((value) => Number(value)>0), z.literal("")]).default(""),
  fee: decimal.default("0"), relatedMovementId: z.union([z.uuid(), z.literal("")]).default(""),
  fxMode: z.enum(["nbu", "manual"]).default("manual"), manualRate: z.string().default(""),
  destinationFxMode: z.enum(["nbu", "manual"]).default("manual"), destinationManualRate: z.string().default(""),
}).superRefine((input, context) => {
  if (["incoming","outgoing","owner_withdrawal"].includes(input.kind) && !input.categoryId) context.addIssue({ code:"custom",message:"category" });
  if (input.expectedItemId && (!["incoming","outgoing","owner_withdrawal"].includes(input.kind) || !input.allocationAmount)) context.addIssue({ code:"custom",message:"settlement" });
  if (!input.expectedItemId && input.allocationAmount) context.addIssue({ code:"custom",message:"settlement" });
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
export const reversalInputSchema = z.object({ requestId: z.uuid(), movementId: z.uuid(), date: z.iso.date(), reason: z.string().trim().min(1).max(2000) });

export function validateMovementAccounts(input: MovementInput, accounts: FinanceAccount[], currencies: FinanceCurrency[]) {
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
