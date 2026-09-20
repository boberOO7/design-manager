"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
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
  if (raw.intent === "schedule" && raw.kind === "recurring" && !raw.id && !String(raw.reason ?? "").trim()) raw.reason = t("schedules.defaultRecurringNote");
  if (raw.intent === "bonus" && !String(raw.description ?? "").trim()) raw.description = t("schedules.addBonus");
  const client = await createClient();
  let error: { message: string } | null;
  if (raw.intent === "schedule") {
    const parsed = scheduleInputSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t(`schedules.errors.${financeScheduleValidationError(parsed.error.issues)}`) };
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc(input.kind === "recurring" ? "save_finance_recurring_schedule" : "save_finance_schedule", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: input }));
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

export async function saveFinanceGroup(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const parsed = z.object({ operation: z.enum(["create", "rename", "up", "down", "assign"]), requestId: z.uuid(), id: z.union([z.uuid(), z.literal("")]).default(""), name: z.string().trim().max(80).default(""), scheduleId: z.union([z.uuid(), z.literal("")]).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("schedules.errors.group") };
  const input = parsed.data, client = await createClient();
  const { error } = await client.rpc("manage_finance_recurring_group", { p_studio_id: admin.studio_id, p_operation: input.operation, p_id: input.id || (input.operation === "create" ? input.requestId : undefined), p_name: input.name || undefined, p_schedule_id: input.scheduleId || undefined });
  if (error) return { status: "error", message: t(error.code === "23505" ? "schedules.errors.groupName" : "schedules.errors.group") };
  revalidatePath("/finance/schedules");
  return { status: "success" };
}

export async function saveInitialPayroll(input: unknown) {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  const parsed = z.array(scheduleInputSchema).min(1).max(100).refine((rows) => new Set(rows.map((row) => row.employeeId)).size === rows.length && rows.every((row) => row.kind === "payroll" && !row.id && row.revision === 0 && !row.groupId)).safeParse(input);
  if (!admin || !parsed.success) return { error: t(!admin ? "planning.errors.forbidden" : "schedules.errors.invalid"), rows: [] };
  const client = await createClient();
  const rows: { employeeId: string; saved: boolean; message: string }[] = [];
  for (const { requestId, ...values } of parsed.data) {
    try {
      const { error } = await client.rpc("save_finance_schedule", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: values });
      rows.push({ employeeId: values.employeeId, saved: !error, message: error ? t(`schedules.errors.${financeScheduleError(error.message)}`) : t("schedules.setupSaved") });
    } catch {
      // A transport failure may follow a commit. Retrying keeps each row's request ID.
      rows.push({ employeeId: values.employeeId, saved: false, message: t("schedules.setupRetry") });
    }
  }
  revalidatePath("/finance", "layout");
  revalidatePath("/calendar");
  return { error: "", rows };
}

export async function moveFinanceRules(input: unknown) {
  const t = await getTranslations("Finance"), admin = await getActiveStudioAdmin();
  if (!admin) return { moved: [], error: t("planning.errors.forbidden") };
  const parsed = z.object({ groupId: z.union([z.uuid(), z.literal("")]), scheduleIds: z.array(z.uuid()).min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { moved: [], error: t("schedules.errors.group") };
  const client = await createClient(), moved: string[] = [];
  for (const scheduleId of new Set(parsed.data.scheduleIds)) {
    try {
      // Assignment is an idempotent SET. Repeating after an uncertain response is safe.
      const { error } = await client.rpc("manage_finance_recurring_group", { p_studio_id: admin.studio_id, p_operation: "assign", p_id: parsed.data.groupId || undefined, p_schedule_id: scheduleId });
      if (!error) moved.push(scheduleId);
    } catch { /* Keep this rule in the selection so it can be retried. */ }
  }
  revalidatePath("/finance/schedules");
  return { moved, error: moved.length === new Set(parsed.data.scheduleIds).size ? "" : t("schedules.moveRetry") };
}
