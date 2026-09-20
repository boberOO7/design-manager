"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { budgetInputSchema, forecastFxSchema, forecastOptionsSchema } from "@/lib/finance-forecast";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceCashPlan(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.forecast");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const client = await createClient();
  let error: { message: string } | null;
  let id: string | null;
  if (form.get("intent") === "budget") {
    const parsed = budgetInputSchema.safeParse({ ...Object.fromEntries(form), months: form.getAll("months") });
    if (!parsed.success) return { status: "error", message: t("errors.invalid") };
    const { requestId, ...input } = parsed.data;
    ({ error, data: id } = await client.rpc("save_finance_budget", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
  } else if (form.get("intent") === "snapshot") {
    let fx: unknown;
    try { fx = JSON.parse(String(form.get("fx"))); } catch { return { status: "error", message: t("errors.invalid") }; }
    const parsed = forecastOptionsSchema.extend({ requestId: z.uuid(), name: z.string().trim().min(1).max(120), fx: forecastFxSchema }).safeParse({ ...Object.fromEntries(form), fx });
    if (!parsed.success) return { status: "error", message: t("errors.invalid") };
    const v = parsed.data;
    ({ error, data: id } = await client.rpc("save_finance_forecast_snapshot", { p_studio_id: admin.studio_id, p_request_id: v.requestId, p_name: v.name, p_horizon: v.horizon, p_scenario: v.scenario, p_fx: v.fx }));
  } else return { status: "error", message: t("errors.invalid") };
  if (error) return { status: "error", message: t(error.message.includes("version_conflict") ? "errors.conflict" : error.message.includes("fx_invalid") ? "errors.fx" : "errors.invalid") };
  revalidatePath("/finance", "layout");
  return { status: "success", id: id ?? undefined };
}
