"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { financeProjectError, projectCancellationSchema, projectTermsSchema, supervisionMonthsSchema } from "@/lib/finance-projects";
import { projectPlanSchema } from "@/lib/finance-project-plan";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { getKyivDateOnly } from "@/lib/validation/project";
import { z } from "zod";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceProject(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("planning.errors.forbidden") };
  const raw = Object.fromEntries(form);
  const client = await createClient();
  let error: { message: string } | null;
  if (raw.intent === "plan") {
    let payload: unknown;
    try { payload=JSON.parse(String(raw.plan)); } catch { return { status:"error",message:t("planning.errors.invalid") }; }
    const parsed=projectPlanSchema.safeParse(typeof payload === "object" && payload !== null ? {...payload,requestId:raw.requestId} : null);
    if(!parsed.success) return {status:"error",message:t("planning.errors.invalid")};
    const {requestId,projectId,...input}=parsed.data;
    ({error}=await client.rpc("save_finance_project_plan",{p_studio_id:admin.studio_id,p_request_id:requestId,p_project_id:projectId,p_input:input}));
  } else if (raw.intent === "cancelExpectation") {
    const parsed = projectCancellationSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("planning.errors.invalid") };
    const { requestId, ...input } = parsed.data;
    ({ error } = await client.rpc("cancel_finance_project_expectation", { p_studio_id: admin.studio_id, p_request_id: requestId, p_input: { ...input, retainSettlement: input.retainSettlement === "true" } }));
  } else if (raw.intent === "terms") {
    const parsed = projectTermsSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("planning.errors.invalid") };
    const { requestId, projectId, ...input } = parsed.data;
    ({ error } = await client.rpc("save_finance_project_terms", { p_studio_id: admin.studio_id, p_request_id: requestId, p_project_id: projectId, p_input: input }));
  } else if (raw.intent === "months") {
    const parsed = supervisionMonthsSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: t("project.errors.monthRange") };
    const v = parsed.data;
    ({ error } = await client.rpc("generate_finance_supervision_months", { p_studio_id: admin.studio_id, p_request_id: v.requestId, p_project_id: v.projectId, p_from: v.from, p_through: v.through }));
  } else return { status: "error", message: t("planning.errors.invalid") };
  if (error) {
    const key = financeProjectError(error.message);
    return { status: "error", message: key ? t(`project.errors.${key}`) : t(error.message === "finance_version_conflict" ? "planning.errors.version" : "planning.errors.save") };
  }
  revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/finance", "layout");
  return { status: "success" };
}

export async function getProjectReferenceRate(currency: string) {
  const parsed=z.string().regex(/^[A-Z]{3}$/).safeParse(currency);
  const admin=await getActiveStudioAdmin();
  if(!admin || !parsed.success) return null;
  const client=await createClient();
  const {data,error}=await client.from("finance_settings").select("base_currency").eq("studio_id",admin.studio_id).single();
  if(error || data?.base_currency!=="UAH" || currency==="UAH") return null;
  try { return await resolveFinanceFx(currency,"UAH",getKyivDateOnly(),"nbu",""); } catch { return null; }
}
