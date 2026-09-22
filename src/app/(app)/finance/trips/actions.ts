"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { tripCorrectionSchema, tripEntrySchema, tripInputSchema } from "@/lib/finance-trips";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceTrip(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.trips");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const client = await createClient();
  const raw = Object.fromEntries(form);
  const parsed = raw.intent === "trip" ? tripInputSchema.safeParse({ ...raw, travelers: form.getAll("travelers") })
    : raw.intent === "correct" ? tripCorrectionSchema.safeParse(raw) : tripEntrySchema.safeParse({ ...raw, coveredTravelerIds: form.getAll("coveredTravelerIds") });
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const input = parsed.data;
  // Recover identical requests before FX lookup, including after a lost response.
  const prior = await client.from("finance_planning_requests").select("payload,result_id").eq("studio_id", admin.studio_id).eq("request_id", input.requestId).maybeSingle();
  if (prior.error) return { status: "error", message: t("errors.save") };
  let id: string | null = null;
  let error: { message: string } | null = null;
  if (prior.data) {
    const payload = prior.data.payload;
    const stored = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.input : null;
    const submission = stored && typeof stored === "object" && !Array.isArray(stored) ? stored.submission : null;
    // JSONB key ordering differs from JavaScript; compare canonical key order.
    if (JSON.stringify(submission, Object.keys(input).sort()) !== JSON.stringify(input, Object.keys(input).sort())) return { status: "error", message: t("errors.conflict") };
    id = prior.data.result_id;
  } else if ("title" in input) {
    ({ data: id, error } = await client.rpc("save_finance_trip", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_input: { ...input, submission: input } }));
  } else {
    let fx;
    if ("kind" in input && input.kind !== "plan" && !input.movementId) {
      const setup = await client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single();
      if (setup.error) return { status: "error", message: t("errors.save") };
      try { fx = await resolveFinanceFx(input.currency, setup.data.base_currency, input.date, input.fxMode, input.manualRate); }
      catch { return { status: "error", message: t("errors.fx") }; }
    }
    const args = { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_trip_id: input.tripId, p_input: { ...input, ...(fx ? { fx } : {}), submission: input } };
    ({ data: id, error } = "entryId" in input && input.entryId ? await client.rpc("edit_finance_trip_entry", {...args,p_entry_id:input.entryId}) : await client.rpc("record_finance_trip_entry",args));
  }
  if (error) {
    const key = error.message === "finance_trip_edit_unavailable" ? "editUnavailable" : error.message === "finance_trip_calendar_owned" ? "calendarOwned" : error.message === "finance_version_conflict" ? "version" : error.message === "finance_request_conflict" ? "conflict"
      : error.message === "finance_trip_project_locked" ? "projectLocked" : error.message === "finance_trip_plan_settled" ? "planSettled"
      : error.message === "finance_trip_payment_invalid" ? "payment" : error.message === "finance_trip_closed" ? "closed" : "save";
    return { status: "error", message: t(`errors.${key}`) };
  }
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", ...(id ? { id } : {}) };
}
