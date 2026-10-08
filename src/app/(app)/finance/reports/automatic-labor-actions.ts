"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { laborDataSchema } from "@/lib/finance-labor";
import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import type { FinanceActionState } from "@/lib/finance";

const configurationFields = {
  effectiveFrom: z.iso.date(), employeeId: z.union([z.uuid(), z.literal("")]).optional(),
  internalProjectId: z.uuid().optional(), internalDesignationConfirmed: z.literal("true").transform(() => true).optional(),
  changeActivation: z.literal("true").transform(() => true).optional(), previewDigest: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  dailyMinutes: z.coerce.number().int().positive().max(2147483647), weekdays: z.array(z.number().int().min(1).max(7)).max(7),
};
const configureSchema = z.object({ requestId: z.uuid(), ...configurationFields });
const previewInputSchema = z.object(configurationFields).omit({ previewDigest: true });
const correctionSchema = z.object({ requestId: z.uuid(), obligationId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{32}$/) });
const activationPreviewSchema = z.object({
  digest: z.string().regex(/^[a-f0-9]{32}$/), startsOn: z.iso.date(), capacityFrom: z.iso.date(), recognitionStart: z.iso.date(),
  existingAutomationStart: z.iso.date().nullable(), periods: z.array(z.object({ employeeId: z.uuid(), label: z.string(), periodStart: z.iso.date(), periodEnd: z.iso.date(), knownCost: z.string().nullable(), currency: z.string().nullable(), recognizedCost: z.string(), manual: z.boolean(), protected: z.boolean(), completedDays: z.number().int() })),
});
export type AutomaticLaborActivationPreview = z.infer<typeof activationPreviewSchema>;
export type AutomaticLaborPreviewResult = { status: "success"; preview: AutomaticLaborActivationPreview } | { status: "error"; message: string };

export async function previewAutomaticLabor(form: FormData): Promise<AutomaticLaborPreviewResult> {
  const t = await getTranslations("Finance.labor.auto");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("previewErrors.forbidden") };
  const raw = Object.fromEntries(form);
  let weekdays: unknown;
  try { weekdays = JSON.parse(String(raw.weekdays)); } catch { return { status: "error", message: t("previewErrors.invalid") }; }
  const input = previewInputSchema.safeParse({ ...raw, weekdays });
  if (!input.success) return { status: "error", message: t("previewErrors.invalid") };
  const client = await createClient();
  const { data, error } = await client.rpc("preview_finance_labor_activation", { p_studio_id: admin.studio_id, p_input: input.data });
  if (error) return { status: "error", message: t("previewErrors.failed") };
  const preview = activationPreviewSchema.safeParse(data);
  return preview.success ? { status: "success", preview: preview.data } : { status: "error", message: t("previewErrors.failed") };
}

export async function saveAutomaticLabor(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.labor");
  const fail = (key: string): FinanceActionState => ({ status: "error", message: t(`errors.${key}`) });
  const admin = await getActiveStudioAdmin();
  if (!admin) return fail("forbidden");
  const client = await createClient();
  const raw = Object.fromEntries(form);
  const intent = z.enum(["configure", "recalculate", "approve"]).safeParse(raw.intent);
  if (!intent.success) return fail("invalid");
  let response: { error: { message: string } | null; data: string | null };
  if (intent.data === "configure") {
    let weekdays: unknown;
    try { weekdays = JSON.parse(String(raw.weekdays)); } catch { return fail("invalid"); }
    const input = configureSchema.safeParse({ ...raw, weekdays });
    if (!input.success) return fail("invalid");
    const { requestId, ...payload } = input.data;
    response = await client.rpc("configure_finance_labor_automation", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: payload });
  } else {
    const input = correctionSchema.safeParse(raw);
    if (!input.success) return fail("invalid");
    const prior = await client.from("finance_planning_requests").select("payload,result_id")
      .eq("studio_id", admin.studio_id).eq("request_id", input.data.requestId).maybeSingle();
    if (prior.error) return fail("save");
    if (prior.data) {
      const replay = z.object({ operation: z.literal("automatic_labor"), obligation: z.uuid(), digest: z.string(), approve: z.boolean() }).safeParse(prior.data.payload);
      if (!replay.success || replay.data.obligation !== input.data.obligationId || replay.data.digest !== input.data.digest
        || replay.data.approve !== (intent.data === "approve")) return fail("conflict");
      revalidatePath("/finance", "layout");
      revalidatePath("/projects/[projectId]", "page");
      return { status: "success", id: prior.data.result_id };
    }
    const report = await client.rpc("get_finance_labor_reporting", { p_studio_id: admin.studio_id });
    if (report.error) return fail("save");
    const period = laborDataSchema.parse(report.data).automaticPeriods?.find(period => period.obligationId === input.data.obligationId);
    if (!period?.source || period.digest !== input.data.digest) return fail("conflict");
    if (intent.data === "approve" && period.proposedRemainder == null) return fail("FX");
    const settings = await client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single();
    if (settings.error) return fail("save");
    let fx = period.proposalFx ?? period.pools.find(pool => pool.fx)?.fx ?? null;
    if (!fx) {
      try { fx = await resolveFinanceFx(period.source.currency, settings.data.base_currency, period.periodEnd, "nbu", ""); }
      catch { /* Keep missing FX explicit. */ }
    }
    response = await client.rpc("process_finance_automatic_labor", { p_studio_id: admin.studio_id, p_obligation_id: period.obligationId,
      p_digest: input.data.digest, p_request_id: input.data.requestId, p_approve: intent.data === "approve", p_fx: fx });
  }
  if (response.error) {
    if (response.error.message.includes("finance_preview_required") || response.error.message.includes("finance_version_conflict")) return fail("previewStale");
    if (response.error.message.includes("finance_history_protected")) return fail("historyProtected");
    return fail(response.error.message.includes("conflict") ? "conflict" : "save");
  }
  scheduleAutomaticLabor(admin.studio_id);
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", ...(response.data ? { id: response.data } : {}) };
}
