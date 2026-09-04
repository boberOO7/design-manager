"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { isContractorCategoryColorKey } from "@/lib/contractor-category-colors";
import { createContractorCategoryNameSchema, createContractorSchema, getContractorFormInput, type ContractorFormActionState, type ContractorFormField, type ContractorFormValues } from "@/lib/validation/contractor";

async function parseForm(formData: FormData): Promise<ContractorFormActionState | { values: ContractorFormValues }> {
  const t = await getTranslations("Contractors");
  const parsed = createContractorSchema({
    categoryRequired: t("validation.categoryRequired"), categoryTooLong: t("validation.categoryTooLong"),
    subcategoryTooLong: t("validation.subcategoryTooLong"),
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

function getContractorValues(values: ContractorFormValues) {
  return {
    name: values.name,
    website_url: nullable(values.website_url),
    phone: nullable(values.phone),
    description: nullable(values.description),
  };
}

async function resolveContractorClassification(values: ContractorFormValues) {
  const supabase = await createClient();
  const { data: categoryId, error: categoryError } = await supabase.rpc("resolve_contractor_category", { p_name: values.category });
  if (categoryError || !categoryId) return { error: categoryError ?? new Error("Missing contractor category") };
  if (!values.subcategory) return { categoryId, subcategoryId: null };

  const { data: subcategoryId, error: subcategoryError } = await supabase.rpc("resolve_contractor_subcategory", { p_category_id: categoryId, p_name: values.subcategory });
  if (subcategoryError || !subcategoryId) return { error: subcategoryError ?? new Error("Missing contractor subcategory") };
  return { categoryId, subcategoryId };
}

export async function createContractor(
  _previousState: ContractorFormActionState,
  formData: FormData,
): Promise<ContractorFormActionState> {
  const [membership, t] = await Promise.all([getActiveStudioMembership(), getTranslations("Contractors")]);
  if (!membership) return { formError: t("errors.createPermission") };
  const parsed = await parseForm(formData);
  if (!("values" in parsed)) return parsed;

  const classification = await resolveContractorClassification(parsed.values);
  if ("error" in classification) {
    console.error("Unable to resolve contractor classification", classification.error);
    return { formError: t("errors.createFailed") };
  }
  const supabase = await createClient();
  const contractorValues = getContractorValues(parsed.values);
  const { data, error } = await supabase.from("contractors").insert({
    ...contractorValues,
    category_id: classification.categoryId,
    subcategory_id: classification.subcategoryId,
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
  const [membership, t] = await Promise.all([getActiveStudioMembership(), getTranslations("Contractors")]);
  if (!membership) return { formError: t("errors.updatePermission") };
  const parsed = await parseForm(formData);
  if (!("values" in parsed)) return parsed;

  const classification = await resolveContractorClassification(parsed.values);
  if ("error" in classification) {
    console.error("Unable to resolve contractor classification", classification.error);
    return { formError: t("errors.updateFailed") };
  }
  const supabase = await createClient();
  const contractorValues = getContractorValues(parsed.values);
  const { data, error } = await supabase.from("contractors").update({
    ...contractorValues,
    category_id: classification.categoryId,
    subcategory_id: classification.subcategoryId,
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

export async function updateContractorCategoryColor(categoryId: string, colorKey: string): Promise<{ error?: string }> {
  const [admin, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("Contractors")]);
  if (!admin) return { error: t("categoryManagement.errors.permission") };
  if (!isContractorCategoryColorKey(colorKey)) return { error: t("categoryManagement.errors.colorFailed") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_contractor_category_color", { p_category_id: categoryId, p_color_key: colorKey });
  if (error) {
    console.error("Unable to update contractor category color", error);
    return { error: t("categoryManagement.errors.colorFailed") };
  }
  revalidatePath("/contractors");
  return {};
}

export async function renameContractorCategory(categoryId: string, name: string): Promise<{ error?: string; name?: string }> {
  const [admin, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("Contractors")]);
  if (!admin) return { error: t("categoryManagement.errors.permission") };
  const parsed = createContractorCategoryNameSchema({
    categoryRequired: t("validation.categoryRequired"),
    categoryTooLong: t("validation.categoryTooLong"),
  }).safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("categoryManagement.errors.renameFailed") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_contractor_category", { p_category_id: categoryId, p_name: parsed.data });
  if (error) {
    console.error("Unable to rename contractor category", error);
    return { error: error.message.includes("contractor_category_name_taken") ? t("categoryManagement.errors.nameTaken") : t("categoryManagement.errors.renameFailed") };
  }
  revalidatePath("/contractors");
  return { name: parsed.data };
}

export async function deleteContractorCategory(categoryId: string): Promise<{ error?: string }> {
  const [admin, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("Contractors")]);
  if (!admin) return { error: t("categoryManagement.errors.permission") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_contractor_category", { p_category_id: categoryId });
  if (error) {
    console.error("Unable to delete contractor category", error);
    return { error: error.message.includes("contractor_category_in_use") ? t("categoryManagement.errors.inUse") : t("categoryManagement.errors.deleteFailed") };
  }
  revalidatePath("/contractors");
  return {};
}
