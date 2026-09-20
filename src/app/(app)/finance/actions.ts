"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { financeAccountSchema, financeSettingsSchema, openingValuationSchema, type FinanceActionState } from "@/lib/finance";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { createClient } from "@/lib/supabase/server";

export async function saveFinanceFoundation(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const supabase = await createClient();
  const intent = form.get("intent");
  let error: { message: string } | null;

  if (intent === "settings" || intent === "account") {
    const currencies = await supabase.from("finance_currencies").select("*");
    if (currencies.error || !currencies.data?.length) return { status: "error", message: t("errors.save") };
    if (intent === "settings") {
      const input = financeSettingsSchema(currencies.data).safeParse(Object.fromEntries(form));
      if (!input.success) return { status: "error", message: t("errors.settings") };
      ({ error } = await supabase.rpc("save_finance_settings", {
        p_studio_id: admin.studio_id, p_base_currency: input.data.baseCurrency, p_cutover_date: input.data.cutoverDate,
      }));
    } else {
      const input = financeAccountSchema(currencies.data).safeParse(Object.fromEntries(form));
      if (!input.success) return { status: "error", message: t("errors.account") };
      ({ error } = await supabase.rpc("save_finance_account", {
        p_studio_id: admin.studio_id, p_name: input.data.name, p_currency: input.data.currency,
        p_opening_balance: input.data.openingBalance, ...(input.data.accountId ? { p_account_id: input.data.accountId } : {}),
      }));
    }
  } else if (intent === "opening-valuation") {
    const parsed = openingValuationSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { status: "error", message: t("openingFx.invalid") };
    const input = parsed.data;
    const [settings, account] = await Promise.all([
      supabase.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
      supabase.from("finance_accounts").select("*").eq("studio_id", admin.studio_id).eq("id", input.accountId).maybeSingle(),
    ]);
    if (settings.error || account.error) return { status: "error", message: t("errors.save") };
    if (!settings.data || !account.data || settings.data.base_currency !== input.reportingCurrency || settings.data.cutover_date !== input.date || account.data.currency !== input.currency || account.data.opening_balance !== Number(input.openingAmount)) return { status: "error", message: t("openingFx.changed") };
    if (settings.data.finalized_at && form.get("confirmed") !== "on") return { status: "error", message: t("errors.invalid") };
    let fx;
    try { fx = await resolveFinanceFx(account.data.currency, settings.data.base_currency, settings.data.cutover_date, input.fxMode, input.manualRate); }
    catch { return { status: "error", message: t("openingFx.unavailable") }; }
    ({ error } = await supabase.rpc("value_finance_opening", {
      p_studio_id: admin.studio_id, p_account_id: input.accountId,
      p_input: { currency: input.currency, reportingCurrency: input.reportingCurrency, openingAmount: input.openingAmount, date: input.date, fx },
    }));
  } else if (intent === "finalize" && form.get("confirmed") === "on") {
    ({ error } = await supabase.rpc("finalize_finance_setup", { p_studio_id: admin.studio_id }));
  } else if (intent === "archive" || intent === "restore") {
    const accountId = z.uuid().safeParse(form.get("accountId"));
    if (!accountId.success) return { status: "error", message: t("errors.account") };
    ({ error } = await supabase.rpc("set_finance_account_archived", {
      p_studio_id: admin.studio_id, p_account_id: accountId.data, p_archived: intent === "archive",
    }));
  } else {
    return { status: "error", message: t("errors.invalid") };
  }

  if (error) {
    const openingErrors: Record<string, string> = { finance_opening_fx_required: "required", finance_opening_fx_invalid: "invalid", finance_setup_context_changed: "changed", finance_opening_valuation_locked: "locked" };
    const openingError = openingErrors[error.message];
    if (openingError) return { status: "error", message: t(`openingFx.${openingError}`) };
    const locked = ["finance_setup_finalized", "finance_opening_locked", "finance_new_account_zero_opening"].includes(error.message);
    return { status: "error", message: locked ? t("errors.locked") : error.message === "finance_active_account_required" ? t("errors.activeAccount") : t("errors.save") };
  }
  revalidatePath("/finance", "layout");
  return { status: "success", message: t("saved") };
}
