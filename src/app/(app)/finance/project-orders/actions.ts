"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { projectOrderCurrencyCorrectionSchema, projectOrderInputSchema, parseProjectOrderDraft } from "@/lib/finance-project-orders";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceProjectOrder(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.orders");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = projectOrderInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, projectId, ...input } = parsed.data;
  if (input.intent === "saveDraft") {
    let draft: unknown;
    try { draft = JSON.parse(String(form.get("plan"))); } catch { return { status: "error", message: t("errors.invalid") }; }
    const plan = input.orderId ? parseProjectOrderDraft(draft, projectId, input.orderId) : null;
    if (!plan) return { status: "error", message: t("errors.invalid") };
    const { requestId: _request, projectId: _project, orderId: _order, ...payload } = plan;
    input.plan = payload;
  }
  const client = await createClient();
  const { data, error } = await client.rpc("save_finance_project_order", {
    p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId,
    p_input: z.json().parse(input),
  });
  if (error) return { status: "error", message: t(error.message === "finance_version_conflict" ? "errors.version" : error.message === "finance_request_conflict" ? "errors.conflict" : "errors.save") };
  revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/finance", "layout");
  return { status: "success", id: data };
}

export async function correctFinanceProjectOrderCurrency(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.currencyCorrection");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  let known: unknown;
  try { known = JSON.parse(String(form.get("known"))); }
  catch { return { status: "error", message: t("errors.invalid") }; }
  const parsed = projectOrderCurrencyCorrectionSchema.safeParse({ ...Object.fromEntries(form), known });
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, projectId, ...input } = parsed.data;
  const client = await createClient();
  const { data, error } = await client.rpc("correct_finance_project_order_currency", {
    p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId, p_input: input,
  });
  if (error) {
    const errors: Record<string, string> = {
      finance_admin_required: "forbidden", finance_version_conflict: "version", finance_request_conflict: "conflict",
      finance_order_currency_allocation_history: "payments", finance_order_currency_closure_history: "closures",
      finance_order_currency_recognition_history: "recognition", finance_recognized_source_locked: "recognition",
      finance_recognition_currency_locked: "recognition", finance_order_currency_precision: "precision",
      finance_input_invalid: "invalid", finance_project_order_invalid: "invalid",
    };
    return { status: "error", message: t(`errors.${errors[error.message] ?? "save"}`) };
  }
  revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/finance", "layout");
  return { status: "success", id: data };
}
