"use server";
import { revalidatePath } from "next/cache";
import { isDeepStrictEqual } from "node:util";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { laborAllocationInputSchema, laborAllocationItemsSchema, laborConfirmationInputSchema, laborDataSchema } from "@/lib/finance-labor";
import type { FinanceActionState } from "@/lib/finance";
import { z } from "zod";

export async function saveFinanceLabor(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.labor");
  const fail = (key: string): FinanceActionState => ({ status: "error", message: t(`errors.${key}`) });
  const admin = await getActiveStudioAdmin();
  if (!admin) return fail("forbidden");
  const client = await createClient();
  const raw = Object.fromEntries(form);
  const intent = z.enum(["confirm", "allocate", "reconcile"]).safeParse(raw.intent);
  if (!intent.success) return fail("invalid");
  let items;
  try { items = laborAllocationItemsSchema.parse(raw.items ? JSON.parse(String(raw.items)) : []); }
  catch { return fail("invalid"); }
  const confirmation = laborConfirmationInputSchema.safeParse(raw);
  const allocation = laborAllocationInputSchema.safeParse({ ...raw, items });
  if (intent.data === "allocate" ? !allocation.success : !confirmation.success) return fail("invalid");
  const submission = intent.data === "allocate" && allocation.success ? { ...allocation.data, intent: intent.data }
    : confirmation.success ? { ...confirmation.data, ...(intent.data === "reconcile" ? { items } : {}), intent: intent.data } : null;
  if (!submission) return fail("invalid");
  const prior = await client.from("finance_planning_requests").select("payload,result_id").eq("studio_id", admin.studio_id).eq("request_id", submission.requestId).maybeSingle();
  if (prior.error) return fail("save");
  if (prior.data) {
    const saved = z.object({ input: z.object({ submission: z.unknown() }) }).safeParse(prior.data.payload);
    if (!saved.success || !isDeepStrictEqual(saved.data.input.submission, submission)) return fail("conflict");
    revalidatePath("/finance", "layout");
    return { status: "success", id: prior.data.result_id };
  }
  let error: { message: string } | null;
  if (intent.data === "allocate" && allocation.success) {
    const { requestId, entryId, ...input } = allocation.data;
    ({ error } = await client.rpc("save_finance_labor_allocation", { p_studio_id: admin.studio_id, p_request_id: requestId, p_entry_id: entryId, p_input: { ...input, submission } }));
  } else if (confirmation.success) {
    const { requestId, fxMode, manualRate, ...input } = confirmation.data;
    const [report, settings] = await Promise.all([
      client.rpc("get_finance_labor_reporting", { p_studio_id: admin.studio_id }),
      client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single(),
    ]);
    if (report.error || settings.error) return fail("save");
    const source = laborDataSchema.parse(report.data).sources.find(s => s.obligationId === input.obligationId);
    if (!source || source.version !== input.version) return fail("conflict");
    let fx = null;
    try { fx = await resolveFinanceFx(source.currency, settings.data.base_currency, source.periodEnd, fxMode, manualRate); }
    catch { if (fxMode === "manual" || intent.data === "reconcile" && items.length) return fail("FX"); }
    const payload = { ...input, fx, submission, ...(intent.data === "reconcile" ? { items } : {}) };
    ({ error } = intent.data === "reconcile"
      ? await client.rpc("reconcile_finance_labor_cost", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: payload })
      : await client.rpc("record_finance_labor_cost", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: payload }));
  } else return fail("invalid");
  if (error) return fail(error.message.includes("conflict") ? "conflict" : error.message.includes("overallocated") ? "overallocated" : error.message.includes("no_remaining") ? "noRemaining" : error.message.includes("fx") ? "FX" : "save");
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success" };
}
