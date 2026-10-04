"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { coverageInputSchema, recognitionInputSchema, recognitionAdjustmentSchema, recognitionSourceSchema } from "@/lib/finance-management";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceManagement(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.management");
  const fail = (key: string): FinanceActionState => ({ status: "error", message: t(`errors.${key}`) });
  const admin = await getActiveStudioAdmin();
  if (!admin) return fail("forbidden");
  const client = await createClient();
  const raw = Object.fromEntries(form);
  if (typeof raw.intent !== "string") return fail("invalid");
  const intent = raw.intent;
  const request = z.uuid().safeParse(raw.requestId);
  if (!request.success) return fail("invalid");
  let error: { message: string } | null = null;
  if (intent === "activation") {
    const month = z.iso.date().safeParse(raw.month);
    if (!month.success) return fail("invalid");
    ({ error } = await client.rpc("activate_finance_recognition", { p_studio_id: admin.studio_id, p_request_id: request.data, p_month: month.data }));
  } else if (intent === "coverage") {
    const parsed = coverageInputSchema.safeParse(raw);
    if (!parsed.success) return fail("invalid");
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc("save_finance_report_coverage", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
  } else if (intent === "value") {
    const parsed = z.object({ entryId: z.uuid(), fxMode: z.enum(["nbu", "manual"]).default("nbu"), manualRate: z.string().default("") }).safeParse(raw);
    if (!parsed.success) return fail("invalid");
    const entry = await client.from("finance_recognition_entries").select("currency,reporting_currency,recognized_on").eq("studio_id", admin.studio_id).eq("id", parsed.data.entryId).single();
    if (entry.error) return fail("save");
    let fx;
    try { fx = await resolveFinanceFx(entry.data.currency, entry.data.reporting_currency, entry.data.recognized_on, parsed.data.fxMode, parsed.data.manualRate); }
    catch { return fail("FX"); }
    ({ error } = await client.rpc("value_finance_recognition", { p_studio_id: admin.studio_id, p_entry_id: parsed.data.entryId, p_fx: fx }));
  } else {
    const recognizing = intent === "recognition" || intent === "correction";
    const recognition = recognizing ? recognitionInputSchema.safeParse(raw) : null;
    const adjustment = intent !== "recognition" ? recognitionAdjustmentSchema.safeParse({ ...raw, operation: intent }) : null;
    if (recognizing && !recognition?.success || intent !== "recognition" && !adjustment?.success) return fail("invalid");
    const submission = recognizing && recognition?.success ? { ...recognition.data, intent, ...(adjustment?.success ? { entryId: adjustment.data.entryId } : {}) }
      : adjustment?.success ? { ...adjustment.data, intent } : null;
    if (!submission) return fail("invalid");
    const prior = await client.from("finance_planning_requests").select("payload,result_id").eq("studio_id", admin.studio_id).eq("request_id", request.data).maybeSingle();
    if (prior.error) return fail("save");
    if (prior.data) {
      const payload = z.object({ input: z.object({ submission: z.unknown() }) }).safeParse(prior.data.payload);
      if (!payload.success || !isDeepStrictEqual(payload.data.input.submission, submission)) return fail("conflict");
      revalidatePath("/finance", "layout");
      return { status: "success", id: prior.data.result_id };
    }
    if (recognition?.success) {
      const { requestId, fxMode, manualRate, ...input } = recognition.data;
      const [sourceRows, settings] = await Promise.all([
        client.rpc("get_finance_recognition_sources", { p_studio_id: admin.studio_id }),
        client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single(),
      ]);
      if (sourceRows.error || settings.error) return fail("save");
      const source = z.array(recognitionSourceSchema).parse(sourceRows.data).find(s => s.kind === input.sourceKind && s.sourceId === input.sourceId);
      if (!source) return fail("overSource");
      let fx = null;
      try { fx = await resolveFinanceFx(source.currency, settings.data.base_currency, input.date, fxMode, manualRate); }
      catch { if (fxMode === "manual") return fail("FX"); }
      const payload = { ...input, projectId: input.projectId || null, fx, submission };
      if (intent === "correction" && adjustment?.success) {
        ({ error } = await client.rpc("adjust_finance_recognition", { p_studio_id: admin.studio_id, p_request_id: requestId, p_entry_id: adjustment.data.entryId,
          p_input: { operation: "correction", reason: input.reason, replacement: payload, submission } }));
      } else ({ error } = await client.rpc("record_finance_recognition", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: payload }));
    } else if (adjustment?.success) {
      const { requestId, entryId, ...input } = adjustment.data;
      ({ error } = await client.rpc("adjust_finance_recognition", { p_studio_id: admin.studio_id, p_request_id: requestId, p_entry_id: entryId, p_input: { ...input, submission } }));
    }
  }
  if (error) return fail(error.message.includes("conflict") ? "conflict" : error.message.includes("over_source") ? "overSource" : error.message.includes("locked") ? "locked" : error.message.includes("fx") ? "FX" : "save");
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success" };
}
