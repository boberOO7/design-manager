"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { financeAccountSchema, financeSettingsSchema, type FinanceActionState } from "@/lib/finance";
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
    const locked = ["finance_setup_finalized", "finance_opening_locked", "finance_new_account_zero_opening"].includes(error.message);
    return { status: "error", message: locked ? t("errors.locked") : error.message === "finance_active_account_required" ? t("errors.activeAccount") : t("errors.save") };
  }
  revalidatePath("/finance");
  return { status: "success", message: t("saved") };
}
