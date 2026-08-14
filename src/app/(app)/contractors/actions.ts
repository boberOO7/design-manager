"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { createContractorSchema, getContractorFormInput, type ContractorFormActionState, type ContractorFormField, type ContractorFormValues } from "@/lib/validation/contractor";

async function parseForm(formData: FormData): Promise<ContractorFormActionState | { values: ContractorFormValues }> {
  const t = await getTranslations("Contractors");
  const parsed = createContractorSchema({
    categoryRequired: t("validation.categoryRequired"), categoryTooLong: t("validation.categoryTooLong"),
    nameRequired: t("validation.nameRequired"), nameTooLong: t("validation.nameTooLong"),
    websiteTooLong: t("validation.websiteTooLong"), websiteInvalid: t("validation.websiteInvalid"),
    phoneTooLong: t("validation.phoneTooLong"), phoneInvalid: t("validation.phoneInvalid"),
    descriptionTooLong: t("validation.descriptionTooLong"),
  }).safeParse(getContractorFormInput(formData));
  if (parsed.success) return { values: parsed.data };
  const fieldErrors: Partial<Record<ContractorFormField, string>> = {};
  const flattened = parsed.error.flatten().fieldErrors;
  for (const field of Object.keys(flattened) as ContractorFormField[]) {
    const message = flattened[field]?.[0];
    if (message) fieldErrors[field] = message;
  }
  return { formError: t("validation.correctFields"), fieldErrors };
}

function nullable(value: string | undefined) {
  return value || null;
}

export async function createContractor(
  _previousState: ContractorFormActionState,
  formData: FormData,
): Promise<ContractorFormActionState> {
  const [membership, t] = await Promise.all([getActiveStudioMembership(), getTranslations("Contractors")]);
  if (!membership) return { formError: t("errors.createPermission") };
  const parsed = await parseForm(formData);
  if (!("values" in parsed)) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase.from("contractors").insert({
    ...parsed.values,
    website_url: nullable(parsed.values.website_url),
    phone: nullable(parsed.values.phone),
    description: nullable(parsed.values.description),
    created_by: membership.authenticatedUserId,
  }).select("id").single();

  if (error || !data) {
    console.error("Unable to create contractor", error);
    return { formError: t("errors.createFailed") };
  }
  revalidatePath("/contractors");
  return { contractorId: data.id };
}

export async function updateContractor(
  contractorId: string,
  _previousState: ContractorFormActionState,
  formData: FormData,
): Promise<ContractorFormActionState> {
  const [admin, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("Contractors")]);
  if (!admin) return { formError: t("errors.updatePermission") };
  const parsed = await parseForm(formData);
  if (!("values" in parsed)) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase.from("contractors").update({
    ...parsed.values,
    website_url: nullable(parsed.values.website_url),
    phone: nullable(parsed.values.phone),
    description: nullable(parsed.values.description),
  }).eq("id", contractorId).select("id").maybeSingle();
  if (error || !data) {
    console.error("Unable to update contractor", error);
    return { formError: t("errors.updateFailed") };
  }
  revalidatePath("/contractors");
  return { contractorId: data.id };
}

export async function deleteContractor(contractorId: string): Promise<{ error?: string }> {
  const [admin, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("Contractors")]);
  if (!admin) return { error: t("errors.deletePermission") };
  const supabase = await createClient();
  const { error } = await supabase.from("contractors").delete().eq("id", contractorId);
  if (error) {
    console.error("Unable to delete contractor", error);
    return { error: t("errors.deleteFailed") };
  }
  revalidatePath("/contractors");
  return {};
}
