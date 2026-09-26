"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { financeAccountSchema, financeAmountUnits, financeBalanceEntrySchema, financeSettingsSchema, openingValuationSchema, type FinanceActionState } from "@/lib/finance";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { createClient } from "@/lib/supabase/server";
import { getFinanceData } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function saveFinanceFoundation(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const supabase = await createClient();
  const intent = form.get("intent");
  let error: { message: string } | null;
  let id: string | null = null;

  if (intent === "settings" || intent === "account" || intent === "account-dated") {
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
      if (intent === "account-dated") {
        const date = z.iso.date().safeParse(form.get("date"));
        const settings = await supabase.from("finance_settings").select("base_currency,cutover_date,finalized_at").eq("studio_id", admin.studio_id).single();
        if (!date.success || input.data.accountId || settings.error || !settings.data?.finalized_at
          || date.data < settings.data.cutover_date || date.data > getKyivDateOnly()) return { status: "error", message: t("errors.account") };
        const amount = String(form.get("openingBalance")).trim().replace(",", ".");
        const mode = z.enum(["nbu", "manual"]).safeParse(form.get("fxMode") ?? "manual");
        if (!mode.success) return { status: "error", message: t("errors.account") };
        const submission = { name: input.data.name, accountType: input.data.accountType, currency: input.data.currency, openingBalance: amount, date: date.data,
          fxMode: mode.data, manualRate: String(form.get("manualRate") ?? "") };
        const prior = await supabase.from("finance_planning_requests").select("result_id,payload")
          .eq("studio_id", admin.studio_id).eq("request_id", input.data.requestId).maybeSingle();
        if (prior.error) return { status: "error", message: t("errors.save") };
        if (prior.data) {
          const payload = prior.data.payload;
          const recorded = payload && typeof payload === "object" && !Array.isArray(payload)
            && payload.input && typeof payload.input === "object" && !Array.isArray(payload.input) ? payload.input.submission : null;
          if (JSON.stringify(recorded) !== JSON.stringify(submission))
            return { status: "error", message: t("errors.accountRequestConflict") };
          revalidatePath("/finance", "layout");
          return { status: "success", message: t("saved"), id: prior.data.result_id };
        }
        let fx = null;
        if (input.data.openingBalance !== 0) {
          try { fx = await resolveFinanceFx(input.data.currency, settings.data.base_currency, date.data,
            submission.fxMode === "nbu" ? "nbu" : "manual", String(submission.manualRate)); }
          catch { return { status: "error", message: t("openingFx.unavailable") }; }
        }
        ({ error, data: id } = await supabase.rpc("create_finance_account_with_opening", {
          p_studio_id: admin.studio_id, p_request_id: input.data.requestId,
          p_input: { ...submission, fx, submission },
        }));
      } else {
        ({ error, data: id } = await supabase.rpc("save_finance_account", {
          p_studio_id: admin.studio_id, p_name: input.data.name, p_currency: input.data.currency, p_account_type: input.data.accountType,
          p_request_id: input.data.requestId,
          p_opening_balance: input.data.openingBalance, ...(input.data.accountId ? { p_account_id: input.data.accountId } : {}),
        }));
      }
    }
  } else if (intent === "balance-entry") {
    const parsed = financeBalanceEntrySchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { status: "error", message: t("balance.invalid") };
    const input = parsed.data;
    const submission = { kind: input.kind, accountId: input.accountId, date: input.date,
      amount: input.amount, note: input.note, fxMode: input.fxMode, manualRate: input.manualRate };
    const prior = await supabase.from("finance_movements").select("id,request_payload").eq("studio_id", admin.studio_id)
      .eq("request_id", input.requestId).maybeSingle();
    if (prior.error) return { status: "error", message: t("errors.save") };
    if (prior.data) {
      const payload = prior.data.request_payload;
      const recorded = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.submission : null;
      if (JSON.stringify(recorded) !== JSON.stringify(submission))
        return { status: "error", message: t("errors.accountRequestConflict") };
      revalidatePath("/finance", "layout");
      return { status: "success", message: t("saved"), id: prior.data.id };
    }
    const data = await getFinanceData();
    const account = data?.accounts.find((item) => item.id === input.accountId && !item.archived_at);
    const currency = data?.currencies.find((item) => item.code === account?.currency);
    if (!account || !currency || !data?.settings?.finalized_at || input.date < data.settings.cutover_date
      || input.date > getKyivDateOnly() || (input.amount.split(".")[1]?.length ?? 0) > currency.minor_units)
      return { status: "error", message: t("balance.invalid") };
    const book = data.balances.find((item) => item.id === account.id);
    if (input.kind === "account_opening" && (account.opening_balance !== 0 || Number(book?.ledger_entry_count ?? 0) !== 0))
      return { status: "error", message: t("balance.openingUnavailable") };
    if (input.kind === "balance_adjustment" && book
      && financeAmountUnits(input.amount, currency.minor_units) === financeAmountUnits(book.recorded_balance, currency.minor_units))
      return { status: "error", message: t("balance.noDifference") };
    let fx;
    try { fx = await resolveFinanceFx(account.currency, data.settings.base_currency, input.date, input.fxMode, input.manualRate); }
    catch { return { status: "error", message: t("openingFx.unavailable") }; }
    ({ error, data: id } = await supabase.rpc("record_finance_account_balance", {
      p_studio_id: admin.studio_id, p_request_id: input.requestId,
      p_input: { ...submission, fx, submission },
    }));
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
  } else if (intent === "reopen") {
    ({ error } = await supabase.rpc("reopen_finance_setup", { p_studio_id: admin.studio_id }));
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
    if (error.message === "finance_reopen_history_exists") return { status: "error", message: t("reopenUnavailable") };
    if (error.message === "finance_cutover_future") return { status: "error", message: t("errors.futureCutover") };
    if (error.message === "finance_request_conflict") return { status: "error", message: t("errors.accountRequestConflict") };
    const openingErrors: Record<string, string> = { finance_opening_fx_required: "required", finance_opening_fx_invalid: "invalid", finance_setup_context_changed: "changed", finance_opening_valuation_locked: "locked" };
    const openingError = openingErrors[error.message];
    if (openingError) return { status: "error", message: t(`openingFx.${openingError}`) };
    if (error.message === "finance_opening_unavailable") return { status: "error", message: t("balance.openingUnavailable") };
    if (error.message === "finance_no_balance_difference") return { status: "error", message: t("balance.noDifference") };
    const locked = ["finance_setup_finalized", "finance_opening_locked", "finance_new_account_zero_opening"].includes(error.message);
    return { status: "error", message: locked ? t("errors.locked") : error.message === "finance_active_account_required" ? t("errors.activeAccount") : t("errors.save") };
  }
  revalidatePath("/finance", "layout");
  return { status: "success", message: t("saved"), ...(id ? { id } : {}) };
}
