"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCrmLeadHistory, type CrmLeadHistory } from "@/data/queries/crm";
import { parseCrmBudgetInput } from "@/lib/crm-budget";
import { resolveCrmFollowUpAt } from "@/lib/crm";
import { zonedWallTimeToIso } from "@/lib/calendar";
import { normalizePhoneForCountry } from "@/lib/ukrainian-phone";
import { createClient } from "@/lib/supabase/server";
import {
  crmCandidateContactSchema,
  crmCandidateSchema,
  crmLeadSchema,
  crmRecruitingCycleSchema,
  CRM_LEAD_INVALID_REASONS,
  CRM_LEAD_STATUSES,
  formValues,
  resolveCrmLeadSourceValue,
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
    if (typeof field !== "string" || fieldErrors[field]) continue;
    if (field === "email") fieldErrors[field] = t("validation.invalidEmail");
    else if (field === "phone") fieldErrors[field] = t("validation.invalidPhone");
    else if (field === "external_profile_url") fieldErrors[field] = t("validation.invalidUrl");
    else if (field === "approximate_area") fieldErrors[field] = t("validation.invalidArea");
    else if (field === "budget_amount") fieldErrors[field] = t("validation.invalidBudget");
    else if (field === "country_code") fieldErrors[field] = t("validation.invalidCountry");
    else if (field === "responsible_admin_id") fieldErrors[field] = t("validation.invalidResponsible");
    else if (field === "next_contact_time") fieldErrors[field] = t("validation.invalidTime");
    else if (field === "first_contact_date" || field === "next_contact_date") fieldErrors[field] = t("validation.invalidDate");
    else if (field === "interview_at") fieldErrors[field] = t("validation.invalidDateTime");
    else fieldErrors[field] = t("validation.invalidField");
  }
  return { error: t("validation.correctFields"), fieldErrors };
}

async function context(): Promise<{ admin: NonNullable<Awaited<ReturnType<typeof getActiveStudioAdmin>>>; supabase: Awaited<ReturnType<typeof createClient>> } | { error: "permission" | "unavailable" }> {
  try {
    const admin = await getActiveStudioAdmin();
    if (!admin) return { error: "permission" };
    return { admin, supabase: await createClient() };
  } catch (error) {
    console.error("Unable to establish CRM action context", error);
    return { error: "unavailable" };
  }
}

function recruitingCycleParameters(value: z.infer<typeof crmRecruitingCycleSchema>) {
  return {
    p_target_position: value.target_position,
    p_stage: value.outcome ? "decision" as const : value.stage,
    p_outcome: value.outcome,
    p_next_contact_date: value.next_contact_date,
    p_interview_at: value.interview_at ? zonedWallTimeToIso(value.interview_at) : "",
    p_interview_notes: value.interview_notes,
    p_test_task_result: value.test_task_result,
  };
}

export async function saveLead(leadId: string | null, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  const parsed = crmLeadSchema.safeParse(formValues(formData));
  if (!parsed.success) return failure(parsed.error);
  const value = parsed.data;
  const source = resolveCrmLeadSourceValue(value.source, value.source_custom);
  const budget = value.budget_amount ? parseCrmBudgetInput(value.budget_amount, value.budget_currency) : null;
  const needsLegacyRecord = value.country_code === "__legacy__" || (leadId !== null && value.budget_amount === "") || (value.budget_amount !== "" && budget === null);
  const legacyResult = needsLegacyRecord && leadId
    ? await crm.supabase.from("crm_leads").select("country, country_code, budget_note, budget_amount, budget_currency").eq("id", leadId).eq("studio_id", crm.admin.studio_id).maybeSingle()
    : null;
  const legacyLead = legacyResult?.data ?? null;
  const preservesLegacyCountry = value.country_code === "__legacy__" && Boolean(legacyLead?.country) && legacyLead?.country_code === null;
  const preservesLegacyBudget = value.budget_amount === "" && legacyLead?.budget_amount === null && legacyLead?.budget_currency === null && Boolean(legacyLead?.budget_note);
  if (value.country_code === "__legacy__" && !preservesLegacyCountry) {
    return { error: t("validation.correctFields"), fieldErrors: { country_code: t("validation.invalidField") } };
  }
  if (value.budget_amount !== "" && budget === null) {
    return { error: t("validation.correctFields"), fieldErrors: { budget_amount: t("validation.invalidBudget") } };
  }
  const record = {
    client_name: value.client_name,
    company: nullable(value.company),
    email: nullable(value.email),
    phone: nullable(normalizePhoneForCountry(value.phone, value.country_code)),
    source: nullable(source),
    request_description: nullable(value.request_description),
    expected_project_type: nullable(value.expected_project_type),
    expected_project_type_custom: value.expected_project_type === "other" ? nullable(value.expected_project_type_custom) : null,
    city: nullable(value.city),
    city_geonames_id: value.city_geonames_id === "" ? null : value.city_geonames_id,
    country: preservesLegacyCountry ? legacyLead?.country ?? null : null,
    country_code: value.country_code === "__legacy__" ? null : value.country_code,
    approximate_area: value.approximate_area === "" ? null : value.approximate_area,
    budget_amount: budget?.amount ?? null,
    budget_currency: budget?.currency ?? null,
    budget_note: preservesLegacyBudget ? legacyLead?.budget_note ?? null : null,
    responsible_admin_id: nullable(value.responsible_admin_id),
    first_contact_date: value.first_contact_date,
    next_contact_at: resolveCrmFollowUpAt(value.next_contact_date, value.next_contact_time),
    internal_notes: nullable(value.internal_notes),
  };
  const result = leadId
    ? await crm.supabase.from("crm_leads").update(record).eq("id", leadId).eq("studio_id", crm.admin.studio_id).select("id").maybeSingle()
    : await crm.supabase.from("crm_leads").insert({ ...record, status: value.status, studio_id: crm.admin.studio_id }).select("id").single();
  if (result.error || !result.data) {
    console.error("Unable to save CRM lead", result.error);
    if (result.error?.message.includes("responsible_must_be_active_studio_admin")) {
      return { error: t("validation.correctFields"), fieldErrors: { responsible_admin_id: t("validation.invalidResponsible") } };
    }
    return { error: t("errors.saveLead") };
  }
  revalidatePath("/crm/leads");
  revalidatePath("/calendar");
  return { success: true };
}

export async function deleteLead(leadId: string): Promise<{ error?: string }> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!z.uuid().safeParse(leadId).success) return { error: t("errors.deleteLead") };
  const { error } = await crm.supabase.from("crm_leads").delete().eq("id", leadId).eq("studio_id", crm.admin.studio_id);
  if (error) {
    console.error("Unable to delete CRM lead", error);
    return { error: t("errors.deleteLead") };
  }
  revalidatePath("/crm/leads");
  revalidatePath("/calendar");
  return {};
}

export async function updateLeadStatus(leadId: string, status: string, invalidReason?: string | null) {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  const parsed = z.object({
    leadId: z.uuid(),
    status: z.enum(CRM_LEAD_STATUSES),
    invalidReason: z.union([z.enum(CRM_LEAD_INVALID_REASONS), z.null()]).optional(),
  }).safeParse({ leadId, status, invalidReason });
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!parsed.success) return { error: t("errors.updateLeadStatus") };
  const { data, error } = await crm.supabase
    .from("crm_leads")
    .update({
      status: parsed.data.status,
      invalid_reason: parsed.data.status === "invalid" ? parsed.data.invalidReason ?? null : null,
      ...(parsed.data.status === "invalid" ? { next_contact_at: null } : {}),
    })
    .eq("id", parsed.data.leadId)
    .eq("studio_id", crm.admin.studio_id)
    .select("id, status, invalid_reason, next_contact_at, last_contacted_at")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update CRM lead status", error);
    return { error: t("errors.updateLeadStatus") };
  }
  revalidatePath("/crm/leads");
  revalidatePath("/calendar");
  return { lead: data };
}

export async function updateLeadFollowUp(leadId: string, action: "complete" | "cancel" | "schedule", followUp?: { date: string; time: string }) {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  const parsed = z.discriminatedUnion("action", [
    z.object({ leadId: z.uuid(), action: z.literal("complete") }),
    z.object({ leadId: z.uuid(), action: z.literal("cancel") }),
    z.object({ leadId: z.uuid(), action: z.literal("schedule"), date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  ]).safeParse({ leadId, action, ...followUp });
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!parsed.success) return { error: t("errors.updateFollowUp") };
  const nextContactAt = parsed.data.action === "schedule" ? resolveCrmFollowUpAt(parsed.data.date, parsed.data.time) : null;
  let query = crm.supabase
    .from("crm_leads")
    .update({ next_contact_at: nextContactAt, ...(parsed.data.action === "complete" ? { last_contacted_at: new Date().toISOString() } : {}) })
    .eq("id", parsed.data.leadId)
    .eq("studio_id", crm.admin.studio_id);
  if (parsed.data.action === "schedule") query = query.neq("status", "invalid");
  const { data, error } = await query
    .select("id, next_contact_at, last_contacted_at")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update CRM lead follow-up", error);
    return { error: t("errors.updateFollowUp") };
  }
  revalidatePath("/crm/leads");
  revalidatePath("/calendar");
  return { lead: data };
}

export async function loadLeadHistory(leadId: string): Promise<{ error?: string; history?: CrmLeadHistory[] }> {
  const t = await getTranslations("Crm");
  if (!z.uuid().safeParse(leadId).success) return { error: t("errors.loadLeadHistory") };
  try {
    return { history: await getCrmLeadHistory(leadId) };
  } catch (error) {
    console.error("Unable to load CRM lead history", error);
    return { error: t("errors.loadLeadHistory") };
  }
}

export async function createCandidate(_state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  const values = formValues(formData);
  const candidate = crmCandidateSchema.safeParse(values);
  const cycle = crmRecruitingCycleSchema.safeParse(values);
  if (!candidate.success) return failure(candidate.error);
  if (!cycle.success) return failure(cycle.error);
  const { data: candidateId, error } = await crm.supabase.rpc("create_crm_candidate_with_cycle", {
    p_full_name: candidate.data.full_name,
    p_email: candidate.data.email,
    p_phone: normalizePhoneForCountry(candidate.data.phone, "UA"),
    p_external_profile_url: candidate.data.external_profile_url,
    p_source: resolveCrmLeadSourceValue(candidate.data.source, candidate.data.source_custom),
    p_responsible_admin_id: candidate.data.responsible_admin_id,
    ...recruitingCycleParameters(cycle.data),
  });
  if (error || !candidateId) {
    console.error("Unable to create CRM candidate", error);
    if (error?.message.includes("responsible_must_be_active_studio_admin")) {
      return { error: t("validation.correctFields"), fieldErrors: { responsible_admin_id: t("validation.invalidResponsible") } };
    }
    return { error: t("errors.saveCandidate") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function saveCandidateEditor(candidateId: string, cycleId: string, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!z.uuid().safeParse(candidateId).success || !z.uuid().safeParse(cycleId).success) return { error: t("errors.saveCandidate") };
  const values = formValues(formData);
  const candidate = crmCandidateContactSchema.safeParse(values);
  const cycle = crmRecruitingCycleSchema.safeParse(values);
  if (!candidate.success) return failure(candidate.error);
  if (!cycle.success) return failure(cycle.error);
  const { data: updatedCandidate, error } = await crm.supabase.rpc("update_crm_candidate_with_cycle", {
    p_candidate_id: candidateId,
    p_cycle_id: cycleId,
    p_full_name: candidate.data.full_name,
    p_email: candidate.data.email,
    p_phone: normalizePhoneForCountry(candidate.data.phone, "UA"),
    p_external_profile_url: candidate.data.external_profile_url,
    p_source: resolveCrmLeadSourceValue(candidate.data.source, candidate.data.source_custom),
    p_responsible_admin_id: candidate.data.responsible_admin_id,
    ...recruitingCycleParameters(cycle.data),
  });
  if (error || !updatedCandidate) {
    console.error("Unable to update CRM candidate and recruiting cycle", error);
    if (error?.message.includes("responsible_must_be_active_studio_admin")) {
      return { error: t("validation.correctFields"), fieldErrors: { responsible_admin_id: t("validation.invalidResponsible") } };
    }
    return { error: t("errors.saveCandidate") };
  }
  revalidatePath("/crm/candidates");
  return { success: true };
}

export async function startRecruitingCycle(candidateId: string, _state: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const [crm, t] = await Promise.all([context(), getTranslations("Crm")]);
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!z.uuid().safeParse(candidateId).success) return { error: t("errors.saveCycle") };
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
  if ("error" in crm) return { error: t(crm.error === "permission" ? "errors.permission" : "errors.unavailable") };
  if (!z.uuid().safeParse(candidateId).success) return { error: t("errors.deleteCandidate") };
  const { error } = await crm.supabase.from("crm_candidates").delete().eq("id", candidateId).eq("studio_id", crm.admin.studio_id);
  if (error) {
    console.error("Unable to delete CRM candidate", error);
    return { error: t("errors.deleteCandidate") };
  }
  revalidatePath("/crm/candidates");
  return {};
}
