"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceData } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";
import { projectIncomeSchema } from "@/lib/finance-project-income";
import { financeProjectError } from "@/lib/finance-projects";
import { defaultFinanceReportingSource, resolveFinanceFx } from "@/lib/finance-fx";
import { scheduleAutomaticExpenses } from "@/lib/finance-automatic-expenses";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { FinanceActionState } from "@/lib/finance";

export async function saveProjectIncome(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const parsed = projectIncomeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("planning.errors.invalid") };
  const { requestId, projectId, stream, mode, contractorId, accountId, date, ...fields } = parsed.data;
  const client = await createClient();
  if (mode === "received") {
    // Resolve a lost-response retry before accounts or dated FX can change.
    const prior = await client.from("finance_planning_requests").select("payload,result_id")
      .eq("studio_id", admin.studio_id).eq("request_id", requestId).maybeSingle();
    if (prior.error) return { status: "error", message: t("planning.errors.save") };
    if (prior.data) {
      const payload = prior.data.payload;
      const input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.input : null;
      const submission = input && typeof input === "object" && !Array.isArray(input) ? projectIncomeSchema.safeParse(input.submission) : null;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.operation !== "project_income"
        || payload.project !== projectId || !submission?.success || JSON.stringify(submission.data) !== JSON.stringify(parsed.data)) {
        return { status: "error", message: t("planning.errors.conflict") };
      }
      revalidatePath("/finance", "layout");
      revalidatePath("/projects/[projectId]", "page");
      return { status: "success", id: prior.data.result_id };
    }
  }
  const foundation = await getFinanceData();
  if (!foundation?.settings?.finalized_at) return { status: "error", message: t("movements.errors.setup") };
  const item = { ...fields, established: fields.established === "true" };
  const context = { stream, contractorId, source: "manual", item };
  let result;
  if (mode === "received") {
    const account = foundation.accounts.find(account => account.id === accountId && !account.archived_at);
    if (!account || account.currency !== fields.currency || date > getKyivDateOnly()) {
      return { status: "error", message: t("movements.errors.invalid") };
    }
    const fx = await resolveFinanceFx(account.currency, foundation.settings.base_currency, date, defaultFinanceReportingSource, "").catch(() => null);
    result = await client.rpc("record_finance_project_income", {
      p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId,
      p_input: { ...context, receipt: { accountId, date, fx }, submission: parsed.data },
    });
  } else {
    result = await client.rpc("save_finance_project_item", {
      p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId, p_input: context,
    });
  }
  if (result.error) {
    const key = financeProjectError(result.error.message);
    return { status: "error", message: key ? t(`project.errors.${key}`)
      : t(result.error.message === "finance_request_conflict" ? "planning.errors.conflict" : "planning.errors.save") };
  }
  scheduleAutomaticExpenses(admin.studio_id);
  revalidatePath("/finance", "layout");
  revalidatePath("/calendar");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", id: result.data };
}
