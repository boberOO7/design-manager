"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import {
  crmCandidateContactSchema,
  crmCandidateSchema,
  crmLeadSchema,
  crmRecruitingCycleSchema,
  formValues,
  type CrmActionState,
} from "@/lib/validation/crm";

function nullable(value: string) {
  return value || null;
}

async function failure(error: z.ZodError): Promise<CrmActionState> {
  const t = await getTranslations("Crm");
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = t("validation.invalidField");
  }
  return { error: t("validation.correctFields"), fieldErrors };
}

async function context(): Promise<{ admin: NonNullable<Awaited<ReturnType<typeof getActiveStudioAdmin>>>; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  return { admin, supabase: await createClient() };
}

export async function saveLead(leadId: string | null, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm) return { error: t("errors.permission") };
  const parsed = crmLeadSchema.safeParse(formValues(formData));
  if (!parsed.success) return failure(parsed.error);
  const value = parsed.data;
  const record = {
    client_name: value.client_name,
    company: nullable(value.company),
    email: nullable(value.email),
    phone: nullable(value.phone),
    source: nullable(value.source),
    request_description: nullable(value.request_description),
    expected_project_type: nullable(value.expected_project_type),
    city: nullable(value.city),
    country: nullable(value.country),
    approximate_area: value.approximate_area === "" ? null : value.approximate_area,
    budget_note: nullable(value.budget_note),
    responsible_admin_id: nullable(value.responsible_admin_id),
    first_contact_date: value.first_contact_date,
    next_contact_date: nullable(value.next_contact_date),
    internal_notes: nullable(value.internal_notes),
    status: value.status,
  };
  const result = leadId
    ? await crm.supabase.from("crm_leads").update(record).eq("id", leadId).eq("studio_id", crm.admin.studio_id).select("id").maybeSingle()
    : await crm.supabase.from("crm_leads").insert({ ...record, studio_id: crm.admin.studio_id }).select("id").single();
  if (result.error || !result.data) {
    console.error("Unable to save CRM lead", result.error);
    return { error: t("errors.saveLead") };
  }
  revalidatePath("/crm/leads");
  return { success: true };
}

export async function deleteLead(leadId: string): Promise<{ error?: string }> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm || !z.uuid().safeParse(leadId).success) return { error: t("errors.permission") };
  const { error } = await crm.supabase.from("crm_leads").delete().eq("id", leadId).eq("studio_id", crm.admin.studio_id);
  if (error) {
    console.error("Unable to delete CRM lead", error);
    return { error: t("errors.deleteLead") };
  }
  revalidatePath("/crm/leads");
  return {};
}

export async function createCandidate(_state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm) return { error: t("errors.permission") };
  const parsed = crmCandidateSchema.safeParse(formValues(formData));
  if (!parsed.success) return failure(parsed.error);
  const value = parsed.data;
  const { error } = await crm.supabase.rpc("create_crm_candidate", {
    p_full_name: value.full_name,
    p_email: value.email,
    p_phone: value.phone,
    p_external_profile_url: value.external_profile_url,
    p_source: value.source,
    p_responsible_admin_id: value.responsible_admin_id || crm.admin.authenticatedUserId,
    p_internal_notes: value.internal_notes,
    p_target_position: value.target_position,
  });
  if (error) {
    console.error("Unable to create CRM candidate", error);
    return { error: t("errors.saveCandidate") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function updateCandidate(candidateId: string, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm || !z.uuid().safeParse(candidateId).success) return { error: t("errors.permission") };
  const parsed = crmCandidateContactSchema.safeParse(formValues(formData));
  if (!parsed.success) return failure(parsed.error);
  const value = parsed.data;
  const { data, error } = await crm.supabase.from("crm_candidates").update({
    full_name: value.full_name,
    email: nullable(value.email),
    phone: nullable(value.phone),
    external_profile_url: nullable(value.external_profile_url),
    source: nullable(value.source),
    responsible_admin_id: nullable(value.responsible_admin_id),
    internal_notes: nullable(value.internal_notes),
  }).eq("id", candidateId).eq("studio_id", crm.admin.studio_id).select("id").maybeSingle();
  if (error || !data) {
    console.error("Unable to update CRM candidate", error);
    return { error: t("errors.saveCandidate") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function updateRecruitingCycle(cycleId: string, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm || !z.uuid().safeParse(cycleId).success) return { error: t("errors.permission") };
  const parsed = crmRecruitingCycleSchema.safeParse(formValues(formData));
  if (!parsed.success) return failure(parsed.error);
  const value = parsed.data;
  const { data, error } = await crm.supabase.from("crm_recruiting_cycles").update({
    target_position: value.target_position,
    stage: value.outcome ? "decision" : value.stage,
    outcome: value.outcome || null,
    next_contact_date: nullable(value.next_contact_date),
    interview_at: value.interview_at ? new Date(value.interview_at).toISOString() : null,
    interview_notes: nullable(value.interview_notes),
    test_task_result: nullable(value.test_task_result),
    decision_notes: nullable(value.decision_notes),
    completed_at: value.outcome ? new Date().toISOString() : null,
  }).eq("id", cycleId).eq("studio_id", crm.admin.studio_id).select("id").maybeSingle();
  if (error || !data) {
    console.error("Unable to update CRM recruiting cycle", error);
    return { error: t("errors.saveCycle") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function startRecruitingCycle(candidateId: string, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm || !z.uuid().safeParse(candidateId).success) return { error: t("errors.permission") };
  const targetPosition = formData.get("target_position");
  const parsed = z.string().trim().min(1).max(200).safeParse(targetPosition);
  if (!parsed.success) return { error: t("validation.correctFields"), fieldErrors: { target_position: t("validation.invalidField") } };
  const { error } = await crm.supabase.rpc("start_crm_recruiting_cycle", { p_candidate_id: candidateId, p_target_position: parsed.data });
  if (error) {
    console.error("Unable to start CRM recruiting cycle", error);
    return { error: error.message.includes("active_recruiting_cycle_exists") ? t("errors.activeCycle") : t("errors.saveCycle") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function deleteCandidate(candidateId: string): Promise<{ error?: string }> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if (!crm || !z.uuid().safeParse(candidateId).success) return { error: t("errors.permission") };
  const { error } = await crm.supabase.from("crm_candidates").delete().eq("id", candidateId).eq("studio_id", crm.admin.studio_id);
  if (error) {
    console.error("Unable to delete CRM candidate", error);
    return { error: t("errors.deleteCandidate") };
  }
  revalidatePath("/crm/candidates");
  return {};
}
