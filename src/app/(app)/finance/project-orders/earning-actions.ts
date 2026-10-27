"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { saveEarningMilestoneSchema, fulfillEarningMilestoneSchema, earningExceptionKey } from "@/lib/finance-earnings";
import type { FinanceActionState } from "@/lib/finance";
import { z } from "zod";

export async function saveEarningMilestone(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.earnings");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = saveEarningMilestoneSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, projectId, orderId, ...input } = parsed.data;
  const client = await createClient();
  const { data, error } = await client.rpc("save_finance_earning_milestone", { p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId,
    p_order_id: orderId, p_input: { ...input, netAmount: input.netAmount || null, percentage: input.percentage || null } });
  if (error) return { status: "error", message: t(`errors.${error.message === "finance_input_invalid" ? "invalid" : earningExceptionKey(error.message)}`) };
  revalidatePath("/projects/[projectId]", "page"); revalidatePath("/finance", "layout");
  return { status: "success", id: data };
}

export async function fulfillEarningMilestone(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.earnings");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = fulfillEarningMilestoneSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const { requestId, milestoneId, ...input } = parsed.data;
  const client = await createClient();
  const milestone = await client.from("finance_project_earning_milestones").select("terms_id,condition").eq("studio_id", admin.studio_id).eq("id", milestoneId).single();
  if (milestone.error) return { status: "error", message: t("errors.invalid") };
  const [terms, settings, event] = await Promise.all([
    client.from("finance_project_terms").select("currency").eq("studio_id", admin.studio_id).eq("id", milestone.data.terms_id).single(),
    client.from("finance_settings").select("base_currency").eq("studio_id", admin.studio_id).single(),
    input.intent === "retry" ? client.from("finance_project_earning_events").select("occurred_on").eq("studio_id", admin.studio_id).eq("milestone_id", milestoneId).eq("kind", milestone.data.condition).single() : null,
  ]);
  if (terms.error || settings.error || event?.error) return { status: "error", message: t("errors.invalid") };
  let fx = null;
  try { fx = await resolveFinanceFx(terms.data.currency, settings.data.base_currency, event?.data?.occurred_on ?? input.date, "nbu", ""); }
  catch { /* Preserve the fulfillment event; an unresolved valuation is an actionable exception. */ }
  const { data, error } = await client.rpc("fulfill_finance_earning_milestone", { p_studio_id: admin.studio_id, p_request_id: requestId, p_milestone_id: milestoneId, p_input: { ...input, date: input.date || null, confirmed: input.confirmed === "true", fx } });
  if (error) return { status: "error", message: t(`errors.${error.message === "finance_input_invalid" ? "invalid" : earningExceptionKey(error.message)}`) };
  revalidatePath("/projects/[projectId]", "page"); revalidatePath("/finance", "layout");
  return { status: "success", id: data };
}

export async function voidUnrecognizedEarningMilestone(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.earnings");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = z.object({ requestId: z.uuid(), milestoneId: z.uuid(), reason: z.string().trim().min(1).max(2000), confirmed: z.literal("true") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const client = await createClient();
  const { data, error } = await client.rpc("void_unrecognized_earning_milestone", { p_studio_id: admin.studio_id, p_request_id: parsed.data.requestId, p_milestone_id: parsed.data.milestoneId, p_reason: parsed.data.reason });
  if (error) return { status: "error", message: t(`errors.${error.message === "finance_input_invalid" ? "invalid" : earningExceptionKey(error.message)}`) };
  revalidatePath("/projects/[projectId]", "page"); revalidatePath("/finance", "layout");
  return { status: "success", id: data };
}
