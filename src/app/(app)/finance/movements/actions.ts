"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceData } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { movementInputSchema, reversalInputSchema, validateMovementAccounts } from "@/lib/finance-movements";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceMovement(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.movements");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const client = await createClient();
  let error: { message: string } | null;
  if (form.get("intent") === "reverse") {
    const parsed = reversalInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success || form.get("confirmed") !== "on") return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    ({ error } = await client.rpc("reverse_finance_movement", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_movement_id: input.movementId, p_date: input.date, p_reason: input.reason }));
  } else {
    const parsed = movementInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    // Resolve an ambiguous network retry before fetching FX or checking newly archived accounts.
    const prior = await client.from("finance_movements").select("request_payload").eq("studio_id", admin.studio_id).eq("request_id", input.requestId).maybeSingle();
    if (prior.error) return { status: "error", message: t("errors.save") };
    if (prior.data) {
      const payload = prior.data.request_payload;
      const submission = payload && typeof payload === "object" && !Array.isArray(payload) ? movementInputSchema.safeParse(payload.submission) : null;
      if (!submission?.success || JSON.stringify(submission.data) !== JSON.stringify(input)) return { status: "error", message: t("errors.conflict") };
      revalidatePath("/finance", "layout");
      return { status: "success", message: t("saved") };
    }
    const data = await getFinanceData();
    if (!data?.settings?.finalized_at) return { status: "error", message: t("errors.setup") };
    if (input.date < data.settings.cutover_date || input.date > getKyivDateOnly() || !validateMovementAccounts(input, data.accounts, data.currencies)) return { status: "error", message: t("errors.invalid") };
    const account = data.accounts.find((item) => item.id === input.accountId);
    const destination = data.accounts.find((item) => item.id === input.destinationId);
    if (!account) return { status: "error", message: t("errors.invalid") };
    let fx; let destinationFx;
    try {
      fx = await resolveFinanceFx(account.currency, data.settings.base_currency, input.date, input.fxMode, input.manualRate);
      if (input.kind === "transfer" && destination) destinationFx = account.currency === destination.currency ? fx : await resolveFinanceFx(destination.currency, data.settings.base_currency, input.date, input.destinationFxMode, input.destinationManualRate);
    } catch {
      return { status: "error", message: t("errors.fx") };
    }
    const payload = {
      kind: input.kind, nature: input.nature, date: input.date, accountId: input.accountId, amount: input.amount,
      category: input.category, categoryId:input.categoryId, description: input.description, fee: input.fee, fx, submission: input,
      ...(input.kind === "transfer" ? { destinationId: input.destinationId, receivedAmount: input.receivedAmount, destinationFx } : {}),
      ...(input.kind === "refund" ? { relatedMovementId: input.relatedMovementId } : {}),
    };
    ({ error } = input.expectedItemId
      ? await client.rpc("record_finance_expected_payment",{ p_studio_id:admin.studio_id,p_request_id:input.requestId,p_item_id:input.expectedItemId,p_input:payload,p_allocation_amount:Number(input.allocationAmount) })
      : await client.rpc("record_finance_movement", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_input:payload }));
  }
  if (error) {
    const message = error.message === "finance_request_conflict" ? "errors.conflict"
      : error.message === "finance_already_reversed" ? "errors.reversed"
      : error.message === "finance_reverse_refunds_first" ? "errors.refundsFirst"
      : error.message === "finance_refund_exceeds_original" ? "errors.refundAmount"
      : error.message === "finance_account_unavailable" ? "errors.archived" : "errors.save";
    return { status: "error", message: t(message) };
  }
  revalidatePath("/finance", "layout");
  return { status: "success", message: t("saved") };
}
