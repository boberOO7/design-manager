"use server";

import { isDeepStrictEqual } from "node:util";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { scenarioInputSchema } from "@/lib/finance-scenarios";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceForecastScenario(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.forecast.scenarios");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  let assumptions: unknown;
  try { assumptions = JSON.parse(String(form.get("assumptions"))); }
  catch { return { status: "error", message: t("errors.invalid") }; }
  const parsed = scenarioInputSchema.safeParse({ ...Object.fromEntries(form), assumptions });
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, scenarioId, rebaseConfirmed, ...values } = parsed.data;
  const submission = { scenarioId, ...values, rebaseConfirmed: rebaseConfirmed === "true" };
  const input = { ...values, rebaseConfirmed: rebaseConfirmed === "true", submission };
  const client = await createClient();
  const prior = await client.from("finance_planning_requests").select("payload,result_id")
    .eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
  if (prior.error) return { status: "error", message: t("errors.save") };
  if (prior.data) {
    const saved = z.object({ input: z.object({ submission: z.unknown() }) }).safeParse(prior.data.payload);
    if (!saved.success || !isDeepStrictEqual(saved.data.input.submission, submission)) return { status: "error", message: t("errors.conflict") };
    revalidatePath("/finance", "layout");
    return { status: "success", id: prior.data.result_id };
  }
  const result = await client.rpc("save_finance_forecast_scenario", {
    p_studio_id: admin.studio_id, p_request_id: requestId, p_scenario_id: scenarioId || undefined, p_input: input,
  });
  if (result.error) {
    const message = result.error.message;
    const key = message.includes("version_conflict") ? "errors.conflict"
      : message.includes("source_missing") ? "errors.sourceMissing"
      : message.includes("base_required") ? "errors.baseRequired"
      : message.includes("rebase_confirmation_required") ? "errors.rebaseConfirm"
      : message.includes("input_invalid") ? "errors.invalid" : "errors.save";
    return { status: "error", message: t(key) };
  }
  revalidatePath("/finance", "layout");
  return { status: "success", id: result.data ?? undefined };
}
