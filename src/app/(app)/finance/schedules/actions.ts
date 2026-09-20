"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { employeeBonusSchema, financeScheduleError, financeScheduleValidationError, generateObligationsSchema, payrollCostSchema, scheduleInputSchema, stopScheduleSchema } from "@/lib/finance-schedules";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceSchedule(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const raw = Object.fromEntries(form);
  if (raw.intent === "schedule" && raw.kind === "payroll" && !String(raw.reason ?? "").trim()) raw.reason = t(raw.id ? "schedules.defaultRevisionNote" : "schedules.defaultAgreementNote");
  const client = await createClient();
  let error: { message: string } | null;
  if (raw.intent === "schedule") {
    const parsed = scheduleInputSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t(`schedules.errors.${financeScheduleValidationError(parsed.error.issues)}`) };
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc("save_finance_schedule", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
  } else if (raw.intent === "payrollCost") {
    const parsed = payrollCostSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc("complete_finance_payroll_cost", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
  } else if (raw.intent === "generate") {
    const parsed = generateObligationsSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("schedules.errors.range") };
    const v = parsed.data;
    ({ error } = await client.rpc("generate_finance_obligations", { p_studio_id: admin.studio_id, p_request_id: v.requestId, p_schedule_id: v.scheduleId, p_from: v.from, p_through: v.through }));
  } else if (raw.intent === "stop") {
    const parsed = stopScheduleSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
    const v = parsed.data;
    ({ error } = await client.rpc("stop_finance_schedule", { p_studio_id: admin.studio_id, p_request_id: v.requestId, p_schedule_id: v.scheduleId, p_from: v.from }));
  } else if (raw.intent === "bonus") {
    const parsed = employeeBonusSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("schedules.errors.invalid") };
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc("create_finance_employee_bonus", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
  } else return { status: "error", message: t("schedules.errors.invalid") };
  if (error) return { status: "error", message: t(`schedules.errors.${financeScheduleError(error.message)}`) };
  revalidatePath("/finance", "layout");
  revalidatePath("/calendar");
  return { status: "success" };
}
