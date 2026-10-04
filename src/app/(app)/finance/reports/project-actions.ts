"use server";
import { revalidatePath } from "next/cache";
import { isDeepStrictEqual } from "node:util";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { projectCashInputSchema, projectCashSplitItemsSchema, projectCostEstimateInputSchema } from "@/lib/finance-profitability";
import type { FinanceActionState } from "@/lib/finance";
export async function saveFinanceProjectReporting(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.profitability");
  const fail = (key: string): FinanceActionState => ({ status: "error", message: t(`errors.${key}`) });
  const admin = await getActiveStudioAdmin(); if (!admin) return fail("forbidden");
  const raw = Object.fromEntries(form), intent = z.enum(["estimate", "cash"]).safeParse(raw.intent);
  if (!intent.success) return fail("invalid");
  let items;
  try { items = projectCashSplitItemsSchema.parse(raw.items ? JSON.parse(String(raw.items)) : []); } catch { return fail("invalid"); }
  const cash = projectCashInputSchema.safeParse({ ...raw, items }), estimate = projectCostEstimateInputSchema.safeParse(raw);
  const submission = intent.data === "cash" && cash.success ? { ...cash.data, intent: intent.data }
    : intent.data === "estimate" && estimate.success ? { ...estimate.data, intent: intent.data } : null;
  if (!submission) return fail("invalid");
  const client = await createClient();
  const prior = await client.from("finance_planning_requests").select("payload,result_id").eq("studio_id", admin.studio_id).eq("request_id", submission.requestId).maybeSingle();
  if (prior.error) return fail("save");
  if (prior.data) {
    const saved = z.object({ input: z.object({ submission: z.unknown() }) }).safeParse(prior.data.payload);
    if (!saved.success || !isDeepStrictEqual(saved.data.input.submission, submission)) return fail("conflict");
    revalidatePath("/finance", "layout"); revalidatePath("/projects/[projectId]", "page");
    return { status: "success", id: prior.data.result_id };
  }
  let error: { message: string } | null;
  if (intent.data === "cash" && cash.success) {
    const { requestId, movementId, ...input } = cash.data;
    ({ error } = await client.rpc("save_finance_project_cash_split", { p_studio_id: admin.studio_id, p_request_id: requestId, p_movement_id: movementId, p_input: { ...input, submission } }));
  } else if (estimate.success) {
    const { requestId, projectId, fxMode, manualRate, ...input } = estimate.data;
    const settings = await client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single();
    if (settings.error) return fail("save");
    let fx = null;
    try { fx = await resolveFinanceFx(input.currency, settings.data.base_currency, input.date, fxMode, manualRate); }
    catch { if (fxMode === "manual") return fail("FX"); }
    ({ error } = await client.rpc("save_finance_project_cost_estimate", { p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId, p_input: { ...input, fx, submission } }));
  } else return fail("invalid");
  if (error) return fail(error.message.includes("conflict") ? "conflict" : error.message.includes("overallocated") ? "overallocated" : "save");
  revalidatePath("/finance", "layout"); revalidatePath("/projects/[projectId]", "page"); return { status: "success" };
}
