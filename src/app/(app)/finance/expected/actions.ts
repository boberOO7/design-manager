"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { allocationInputSchema,categoryInputSchema,expectedInputSchema,releaseInputSchema, type FinanceExpected } from "@/lib/finance-planning";
import type { FinanceActionState } from "@/lib/finance";
import { projectContextSchema,financeProjectError } from "@/lib/finance-projects";

// Load an explicitly selected receipt independently of the paginated work list.
export async function getProjectCashMatchOptions(projectId: string, movementId: string) {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(movementId).success) return null;
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const { data: payment, error } = await client.from("finance_payment_availability").select("*")
    .eq("studio_id", admin.studio_id).eq("id", movementId).eq("direction", "incoming").gt("unapplied_amount", 0).maybeSingle();
  if (error) throw new Error("Unable to load payment availability.");
  if (!payment?.currency || !payment.nature) return null;
  const { data: categories, error: categoryError } = await client.from("finance_categories").select("id")
    .eq("studio_id", admin.studio_id).eq("nature", payment.nature);
  if (categoryError) throw new Error("Unable to load payment categories.");
  const items: FinanceExpected[] = [];
  if (categories.length) for (let offset = 0; ; offset += 1000) {
    const page = await client.from("finance_project_expected_balances").select("*")
      .eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("direction", "incoming")
      .eq("currency", payment.currency).in("category_id", categories.map(category => category.id))
      .neq("commitment", "cancelled").gt("remaining_amount", 0)
      .order("expected_payment_date", { nullsFirst: false }).order("id").range(offset, offset + 999);
    if (page.error) throw new Error("Unable to load project payment options.");
    items.push(...page.data);
    if (page.data.length < 1000) break;
  }
  return { payment, items };
}

export async function removeFinanceCategory(_state:FinanceActionState,form:FormData):Promise<FinanceActionState> {
  const t=await getTranslations("Finance.planning");
  const admin=await getActiveStudioAdmin();
  if(!admin) return { status:"error",message:t("errors.forbidden") };
  const categoryId=z.uuid().safeParse(form.get("categoryId"));
  if(!categoryId.success) return { status:"error",message:t("errors.invalid") };
  const client=await createClient();
  const { error }=await client.rpc("remove_finance_category",{ p_studio_id:admin.studio_id,p_category_id:categoryId.data });
  if(error) return { status:"error",message:t(error.message==="finance_category_schedule_required"?"errors.categoryScheduleRequired":"errors.save") };
  revalidatePath("/finance","layout");
  return { status:"success" };
}

export async function saveFinancePlanning(_state:FinanceActionState,form:FormData):Promise<FinanceActionState> {
  const t=await getTranslations("Finance.planning");
  const admin=await getActiveStudioAdmin();
  if(!admin) return { status:"error",message:t("errors.forbidden") };
  const client=await createClient();
  const raw=Object.fromEntries(form);
  let error:{ message:string }|null;
  let id:string|null=null;
  if(raw.intent==="category") {
    const parsed=categoryInputSchema.safeParse(raw);
    if(!parsed.success) return { status:"error",message:t("errors.invalid") };
    const { requestId,...input }=parsed.data;
    ({ error,data:id }=await client.rpc("save_finance_category",{ p_studio_id:admin.studio_id,p_request_id:requestId,p_input:{ ...input,archived:input.archived==="true",...(input.projectExpenseEnabled?{projectExpenseEnabled:input.projectExpenseEnabled==="true"}:{}) } }));
  } else if(raw.intent==="allocate") {
    const parsed=allocationInputSchema.safeParse(raw);
    if(!parsed.success) return { status:"error",message:t("errors.invalid") };
    const input=parsed.data;
    ({ error }=await client.rpc("allocate_finance_payment",{ p_studio_id:admin.studio_id,p_request_id:input.requestId,p_item_id:input.itemId,p_movement_id:input.movementId,p_amount:Number(input.amount) }));
  } else if(raw.intent==="release") {
    const parsed=releaseInputSchema.safeParse(raw);
    if(!parsed.success) return { status:"error",message:t("errors.invalid") };
    const input=parsed.data;
    ({ error }=await client.rpc("release_finance_allocation",{ p_studio_id:admin.studio_id,p_request_id:input.requestId,p_allocation_id:input.allocationId,p_reason:input.reason }));
  } else if(raw.intent==="expected") {
    const parsed=expectedInputSchema.safeParse(raw);
    if(!parsed.success) return { status:"error",message:t("errors.invalid") };
    const { requestId,...input }=parsed.data;
    if(raw.projectId) {
      const context=projectContextSchema.safeParse(raw);
      if(!context.success) return { status:"error",message:t("errors.invalid") };
      const { projectId,...link }=context.data;
      ({ error }=await client.rpc("save_finance_project_item",{ p_studio_id:admin.studio_id,p_request_id:requestId,p_project_id:projectId,p_input:{ ...link,extraVisit:link.extraVisit==="true",item:{ ...input,established:input.established==="true" } } }));
    } else ({ error }=await client.rpc("save_finance_expected_item",{ p_studio_id:admin.studio_id,p_request_id:requestId,p_input:{ ...input,established:input.established==="true" } }));
  } else return { status:"error",message:t("errors.invalid") };
  if(error) {
    if(error.message==="finance_category_schedule_required") return { status:"error",message:t("errors.categoryScheduleRequired") };
    if(error.message==="finance_payroll_cost_locked") { const scheduleT=await getTranslations("Finance.schedules");return { status:"error",message:scheduleT("errors.costLocked") }; }
    if(error.message==="finance_obligation_locked") { const scheduleT=await getTranslations("Finance.schedules");return { status:"error",message:scheduleT("errors.locked") }; }
    const projectKey=financeProjectError(error.message);
    if(projectKey) { const projectT=await getTranslations("Finance.project");return { status:"error",message:projectT(`errors.${projectKey}`) }; }
    const key=error.message.includes("duplicate key") ? "duplicate" : error.message==="finance_overallocation" ? "overallocated"
      : error.message==="finance_version_conflict" ? "version" : error.message==="finance_request_conflict" ? "conflict"
      : error.message==="finance_expected_identity_locked" ? "locked" : error.message==="finance_below_settled" ? "belowSettled"
      : error.message==="finance_allocation_incompatible" ? "incompatible" : "save";
    return { status:"error",message:t(`errors.${key}`) };
  }
  revalidatePath("/finance","layout");
  revalidatePath("/calendar");
  revalidatePath("/projects/[projectId]","page");
  return { status:"success",...(id ? { id } : {}) };
}
