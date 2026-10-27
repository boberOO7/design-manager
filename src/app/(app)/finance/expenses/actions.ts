"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { expenseErrorKey, expenseReceiptInputSchema, expenseSourceInfoSchema } from "@/lib/finance-expenses";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { scheduleAutomaticExpenses } from "@/lib/finance-automatic-expenses";
import type { FinanceActionState } from "@/lib/finance";
import { isDeepStrictEqual } from "node:util";

export async function loadExpenseSource(kind: "expected" | "movement", sourceId: string) {
  if (!z.uuid().safeParse(sourceId).success || !["expected", "movement"].includes(kind)) return null;
  const admin = await getActiveStudioAdmin(); if (!admin) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_finance_expense_source", { p_studio_id: admin.studio_id, p_kind: kind, p_source_id: sourceId });
  if (error) throw new Error("Unable to load expense receipt context.", { cause: error });
  return expenseSourceInfoSchema.parse(data);
}

export async function confirmExpenseReceipt(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.expenses");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = expenseReceiptInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, kind, sourceId, fxMode, manualRate, ...input } = parsed.data;
  const client = await createClient();
  const prior = await client.from("finance_planning_requests").select("payload,result_id").eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
  if (prior.error) return { status: "error", message: t("errors.save") };
  if (prior.data) {
    const saved = z.object({ operation: z.literal("expense_receipt"), kind: z.string(), sourceId: z.string(), input: z.object({ submission: z.unknown() }) }).safeParse(prior.data.payload);
    if (!saved.success || !isDeepStrictEqual(saved.data.input.submission, parsed.data)) return { status: "error", message: t("errors.version") };
    revalidatePath("/finance", "layout"); revalidatePath("/projects/[projectId]", "page");
    return { status: "success", id: prior.data.result_id };
  }
  const [source, settings] = await Promise.all([loadExpenseSource(kind, sourceId), client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single()]);
  if (!source?.source || settings.error) return { status: "error", message: t("errors.source_unavailable") };
  let fx = null;
  try { fx = await resolveFinanceFx(source.source.currency, settings.data.base_currency, input.date, fxMode, manualRate); }
  catch { if (fxMode === "manual") return { status: "error", message: t("errors.fx") }; }
  const { data, error } = await client.rpc("confirm_finance_expense_receipt", { p_studio_id: admin.studio_id, p_request_id: requestId, p_kind: kind, p_source_id: sourceId,
    p_input: { ...input, confirmed: true, approveReviewed: input.approveReviewed === "true", fx, submission: parsed.data } });
  if (error) return { status: "error", message: t(`errors.${expenseErrorKey(error.message)}`) };
  scheduleAutomaticExpenses(admin.studio_id);
  revalidatePath("/finance", "layout"); revalidatePath("/projects/[projectId]", "page");
  return { status: "success", id: data };
}

export async function reviewAutomaticExpense(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.expenses");
  const admin = await getActiveStudioAdmin(); if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = z.object({ sourceId: z.uuid(), month: z.iso.date(), digest: z.string().regex(/^[a-f0-9]{32}$/), confirmed: z.literal("true") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const client = await createClient();
  const { data, error } = await client.rpc("process_finance_automatic_expense", { p_studio_id: admin.studio_id, p_source_id: parsed.data.sourceId,
    p_month: parsed.data.month, p_digest: parsed.data.digest, p_approve: true });
  if (error) return { status: "error", message: t(`errors.${expenseErrorKey(error.message)}`) };
  scheduleAutomaticExpenses(admin.studio_id);
  revalidatePath("/finance", "layout"); revalidatePath("/projects/[projectId]", "page");
  return { status: "success", ...(data ? { id: data } : {}) };
}
