"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { contractorSchema, getContractorFormInput, type ContractorFormActionState, type ContractorFormField, type ContractorFormValues } from "@/lib/validation/contractor";

function parseForm(formData: FormData): ContractorFormActionState | { values: ContractorFormValues } {
  const parsed = contractorSchema.safeParse(getContractorFormInput(formData));
  if (parsed.success) return { values: parsed.data };
  const fieldErrors: Partial<Record<ContractorFormField, string>> = {};
  const flattened = parsed.error.flatten().fieldErrors;
  for (const field of Object.keys(flattened) as ContractorFormField[]) {
    const message = flattened[field]?.[0];
    if (message) fieldErrors[field] = message;
  }
  return { formError: "Виправте виділені поля.", fieldErrors };
}

function nullable(value: string | undefined) {
  return value || null;
}

export async function createContractor(
  _previousState: ContractorFormActionState,
  formData: FormData,
): Promise<ContractorFormActionState> {
  const membership = await getActiveStudioMembership();
  if (!membership) return { formError: "Додати підрядника може лише активний учасник студії." };
  const parsed = parseForm(formData);
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
    return { formError: "Не вдалося додати підрядника. Спробуйте ще раз." };
  }
  revalidatePath("/contractors");
  return { contractorId: data.id };
}

export async function updateContractor(
  contractorId: string,
  _previousState: ContractorFormActionState,
  formData: FormData,
): Promise<ContractorFormActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { formError: "Лише активні адміністратори можуть редагувати підрядників." };
  const parsed = parseForm(formData);
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
    return { formError: "Не вдалося оновити підрядника. Спробуйте ще раз." };
  }
  revalidatePath("/contractors");
  return { contractorId: data.id };
}

export async function deleteContractor(contractorId: string): Promise<{ error?: string }> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "Лише активні адміністратори можуть видаляти підрядників." };
  const supabase = await createClient();
  const { error } = await supabase.from("contractors").delete().eq("id", contractorId);
  if (error) {
    console.error("Unable to delete contractor", error);
    return { error: "Не вдалося видалити підрядника. Спробуйте ще раз." };
  }
  revalidatePath("/contractors");
  return {};
}
