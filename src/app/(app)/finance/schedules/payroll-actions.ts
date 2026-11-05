"use server";

import { getFinanceData } from "@/data/queries/finance";
import { defaultFinanceReportingSource, resolveFinanceFx } from "@/lib/finance-fx";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { payrollCashInputSchema, payrollCashSchema, payrollPaymentInputSchema, payrollPaymentSchema, payrollEarningInputSchema, payrollPeriodSchema } from "@/lib/finance-payroll-earnings";
import { financeScheduleError } from "@/lib/finance-schedules";
import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import type { FinanceActionState } from "@/lib/finance";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function loadFinancePayrollPeriod(obligationId: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin || !z.uuid().safeParse(obligationId).success) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_finance_payroll_period", { p_studio_id: admin.studio_id, p_obligation_id: obligationId });
  if (error) throw new Error("Unable to load monthly payroll.", { cause: error });
  return payrollPeriodSchema.parse(data);
}

export async function confirmFinancePayrollEarning(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance"), admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const parsed = payrollEarningInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
  const { requestId, refreshSource, ...input } = parsed.data;
  const client = await createClient();
  const { error } = await client.rpc("confirm_finance_payroll_earning", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: { ...input, refreshSource: refreshSource === "true" } });
  if (error) return { status: "error", message: t(`schedules.errors.${financeScheduleError(error.message)}`) };
  revalidatePath("/finance", "layout");
  revalidatePath("/calendar");
  revalidatePath("/statistics");
  revalidatePath("/projects/[projectId]", "page");
  scheduleAutomaticLabor(admin.studio_id);
  return { status: "success", message: t("saved") };
}

export async function loadFinancePayrollCash(scheduleId: string, date = getKyivDateOnly()) {
  const admin = await getActiveStudioAdmin();
  if (!admin || !z.uuid().safeParse(scheduleId).success || !z.iso.date().safeParse(date).success) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_finance_payroll_cash", { p_studio_id: admin.studio_id, p_schedule_id: scheduleId, p_date: date });
  if (error) throw new Error("Unable to load payroll advances.", { cause: error });
  return payrollCashSchema.parse(data);
}

export async function loadFinancePayrollPayment(itemId: string, date: string, mode: "nbu" | "manual" = "nbu", manualRate = "", paymentCurrency = "UAH", creditOnly = false) {
  const admin = await getActiveStudioAdmin();
  if (!admin || !z.uuid().safeParse(itemId).success || !z.iso.date().safeParse(date).success || date > getKyivDateOnly() || !/^[A-Z]{3}$/.test(paymentCurrency)) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_finance_payroll_payment", { p_studio_id: admin.studio_id, p_item_id: itemId, p_date: date, p_fx: { paymentCurrency, ...(creditOnly ? { creditOnly: true } : {}) } });
  if (error) throw new Error("Unable to load salary payment.", { cause: error });
  if (!data) return null;
  const context = payrollPaymentSchema.parse(data);
  if (context.currency === paymentCurrency || context.cashDue !== null && Number(context.cashDue) === 0) return context;
  const fx = await resolveFinanceFx(context.currency, paymentCurrency, date, mode, manualRate).catch(() => null);
  if (!fx) return context;
  const quoted = await client.rpc("get_finance_payroll_payment", { p_studio_id: admin.studio_id, p_item_id: itemId, p_date: date, p_fx: { ...fx, paymentCurrency } });
  if (quoted.error) throw new Error("Unable to calculate salary payment.", { cause: quoted.error });
  return payrollPaymentSchema.parse(quoted.data);
}

// Resolve an ambiguous network retry using the original submission before fetching rates.
async function priorPayrollCashRequest(requestId: string, input: z.infer<typeof payrollCashInputSchema> | z.infer<typeof payrollPaymentInputSchema>, operation: string, studioId: string) {
  const client = await createClient();
  const { data, error } = await client.from("finance_planning_requests").select("payload").eq("studio_id", studioId).eq("request_id", requestId).maybeSingle();
  if (error) throw new Error("Unable to check payroll request.", { cause: error });
  if (!data) return null;
  const record = z.object({ operation: z.string(), input: z.object({ submission: z.unknown() }) }).safeParse(data.payload);
  const submission = record.success ? (operation === "payroll_advance" ? payrollCashInputSchema : payrollPaymentInputSchema).safeParse(record.data.input.submission) : null;
  return record.success && record.data.operation === operation && Boolean(submission?.success && JSON.stringify(submission.data) === JSON.stringify(input));
}

export async function recordFinancePayrollAdvance(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance"), admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const parsed = payrollCashInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
  const input = parsed.data;
  const prior = await priorPayrollCashRequest(input.requestId, input, "payroll_advance", admin.studio_id);
  if (prior !== null) return payrollCashResult(prior ? null : "finance_request_conflict", t);
  if (input.date > getKyivDateOnly()) return { status: "error", message: t("schedules.errors.invalid") };
  const foundation = await getFinanceData();
  if (!foundation?.settings?.finalized_at) return { status: "error", message: t("movements.errors.setup") };
  const client = await createClient();
  const terms = await client.from("finance_schedule_terms").select("currency").eq("studio_id", admin.studio_id).eq("schedule_id", input.scheduleId).lte("effective_from", input.date).order("effective_from", { ascending: false }).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (terms.error || !terms.data || terms.data.currency !== input.currency) return { status: "error", message: t("schedules.errors.invalid") };
  const account = foundation.accounts.find(account => account.id === input.accountId && !account.archived_at);
  if (!account || account.currency !== input.paymentCurrency) return { status: "error", message: t("schedules.errors.invalid") };
  const payrollFx = await resolveFinanceFx(terms.data.currency, account.currency, input.date, input.mode, input.manualRate).catch(() => null);
  if (!payrollFx) return { status: "error", message: t("movements.errors.fx") };
  const fx = await resolveFinanceFx(input.paymentCurrency, foundation.settings.base_currency, input.date, defaultFinanceReportingSource, "").catch(() => null);
  const { error } = await client.rpc("record_finance_payroll_advance", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_input: { ...input, note: input.note || t("payrollCash.advanceDescription"), fx, payrollFx: { ...payrollFx, paymentCurrency: account.currency }, submission: input } });
  return payrollCashResult(error?.message ?? null, t);
}

export async function recordFinancePayrollPayment(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance"), admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const parsed = payrollPaymentInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
  const input = parsed.data;
  const prior = await priorPayrollCashRequest(input.requestId, input, "payroll_payment", admin.studio_id);
  if (prior !== null) return payrollCashResult(prior ? null : "finance_request_conflict", t);
  if (input.date > getKyivDateOnly()) return { status: "error", message: t("schedules.errors.invalid") };
  const foundation = await getFinanceData();
  if (!foundation?.settings?.finalized_at) return { status: "error", message: t("movements.errors.setup") };
  const account = foundation.accounts.find(account => account.id === input.accountId && !account.archived_at);
  if ((Number(input.amount) > 0 && !account) || (account && account.currency !== input.paymentCurrency)) return { status: "error", message: t("schedules.errors.invalid") };
  if (!foundation.currencies.some(currency => currency.code === input.paymentCurrency)) return { status: "error", message: t("schedules.errors.invalid") };
  const client = await createClient();
  const context = await client.rpc("get_finance_payroll_payment", { p_studio_id: admin.studio_id, p_item_id: input.itemId, p_date: input.date, p_fx: { paymentCurrency: input.paymentCurrency, ...(Number(input.amount) === 0 ? { creditOnly: true } : {}) } });
  if (context.error || !context.data) return { status: "error", message: t("schedules.errors.invalid") };
  const salary = payrollPaymentSchema.parse(context.data);
  const creditOnly = Number(input.amount) === 0 && salary.cashDue !== null && Number(salary.cashDue) === 0;
  const payrollFx = creditOnly ? { paymentCurrency: input.paymentCurrency, creditOnly: true } : await resolveFinanceFx(salary.currency, input.paymentCurrency, input.date, input.mode, input.manualRate).catch(() => null);
  if (!payrollFx) return { status: "error", message: t("movements.errors.fx") };
  const fx = Number(input.amount) > 0 ? await resolveFinanceFx(input.paymentCurrency, foundation.settings.base_currency, input.date, defaultFinanceReportingSource, "").catch(() => null) : null;
  const { error } = await client.rpc("record_finance_payroll_payment", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_item_id: input.itemId, p_input: { ...input, ...(input.earningDigest ? { earningReason: t("payrollEarning.defaultReason") } : {}), payrollFx: { ...payrollFx, paymentCurrency: input.paymentCurrency }, fx, submission: input } });
  if (!error && input.earningDigest) {
    revalidatePath("/calendar");
    revalidatePath("/statistics");
    scheduleAutomaticLabor(admin.studio_id);
  }
  return payrollCashResult(error?.message ?? null, t);
}

function payrollCashResult(error: string | null, t: Awaited<ReturnType<typeof getTranslations<"Finance">>>): FinanceActionState {
  if (error) return { status: "error", message: error === "finance_payroll_uah_required" ? t("payrollCash.uahRequired") : t(`schedules.errors.${financeScheduleError(error)}`) };
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", message: t("saved") };
}
