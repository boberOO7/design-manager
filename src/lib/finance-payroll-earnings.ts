import { z } from "zod";

const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const signedMoney = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const source = z.object({
  id: z.uuid(), projectId: z.uuid(), taskId: z.uuid().nullable(), projectName: z.string().nullable(), taskTitle: z.string().nullable(),
  stage: z.string().nullable(), sourceType: z.string(), completedAt: z.string(), area: money,
});
const basis = z.object({
  termsId: z.uuid(), payMethod: z.enum(["fixed", "per_m2"]), rate: money.nullable(), currency: z.string(), basis: z.enum(["net", "gross"]),
  periodStart: z.iso.date(), periodEnd: z.iso.date(), area: money, calculatedAmount: money, sources: z.array(source), digest: z.string().regex(/^[a-f0-9]{32}$/),
});
const earning = z.object({ revision: z.number().int().positive(), source: basis, calculatedAmount: money, adjustment: signedMoney, finalAmount: money, payout: money, reason: z.string() });
export const payrollPeriodSchema = z.object({
  obligationId: z.uuid(), scheduleId: z.uuid(), employeeName: z.string().nullable(), periodStart: z.iso.date(), periodEnd: z.iso.date(),
  current: basis, confirmed: earning.nullable(), paid: signedMoney, expectedItemId: z.uuid().nullable(), sourceChanged: z.boolean(),
  history: z.array(earning.extend({ createdAt: z.string(), createdBy: z.uuid() })),
});
export type PayrollPeriod = z.infer<typeof payrollPeriodSchema>;
export const payrollEarningInputSchema = z.object({
  requestId: z.uuid(), obligationId: z.uuid(), revision: z.coerce.number().int().min(0), digest: z.string().regex(/^[a-f0-9]{32}$/),
  refreshSource: z.enum(["true", "false"]).default("false"),
  finalAmount: z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform(value => value.replace(",", ".")),
  reason: z.string().trim().min(1).max(2000),
});

export const payrollCashSchema = z.object({ currency: z.string().nullable(), balances: z.array(z.object({ currency: z.enum(["UAH", "USD"]), available: money })) });
export const payrollPaymentSchema = z.object({
  obligationId: z.uuid(), employeeId: z.uuid(), employeeName: z.string().nullable(), currency: z.enum(["UAH", "USD"]),
  remaining: money, date: z.iso.date(), rate: money.nullable(), advanceAvailable: money, advanceUsed: money.nullable(),
  totalUah: money.nullable(), cashDue: money.nullable(), digest: z.string(),
});
export type PayrollPayment = z.infer<typeof payrollPaymentSchema>;
const cashAmount = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/).transform(value => value.replace(",", "."));
export const payrollCashInputSchema = z.object({
  requestId: z.uuid(), scheduleId: z.uuid(), currency: z.enum(["UAH", "USD"]), accountId: z.uuid(), date: z.iso.date(),
  mode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().default(""),
  amount: cashAmount.refine(value => Number(value) > 0), note: z.string().trim().min(1).max(2000),
});
export const payrollPaymentInputSchema = z.object({
  requestId: z.uuid(), itemId: z.uuid(), accountId: z.union([z.uuid(), z.literal("")]), date: z.iso.date(), amount: cashAmount,
  digest: z.string().regex(/^[a-f0-9]{32}$/), mode: z.enum(["nbu", "manual"]), manualRate: z.string().default(""),
  note: z.string().trim().max(2000),
});
