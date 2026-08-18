import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ContractorSubcategory = { id: string; name: string };

export type ContractorCategory = {
  id: string;
  name: string;
  colorKey: string;
  subcategories: ContractorSubcategory[];
};

export type Contractor = {
  id: string;
  category: ContractorCategory;
  subcategory: ContractorSubcategory | null;
  name: string;
  website_url: string | null;
  phone: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ContractorQueryRow = Omit<Contractor, "category"> & {
  category: { id: string; name: string; color_key: string };
  subcategory: ContractorSubcategory | null;
};

type CategoryQueryRow = {
  id: string;
  name: string;
  color_key: string;
  subcategories: ContractorSubcategory[];
};

export async function getContractors(): Promise<{ categories: ContractorCategory[]; contractors: Contractor[]; error: boolean }> {
  const supabase = await createClient();
  const [{ data: contractorRows, error: contractorError }, { data: categoryRows, error: categoryError }] = await Promise.all([
    supabase
      .from("contractors")
      .select("id, category:contractor_categories!inner(id, name, color_key), subcategory:contractor_subcategories!contractors_subcategory_category_fkey(id, name), name, website_url, phone, description, created_by, created_at, updated_at")
      .order("name", { ascending: true })
      .overrideTypes<ContractorQueryRow[], { merge: false }>(),
    supabase
      .from("contractor_categories")
      .select("id, name, color_key, subcategories:contractor_subcategories(id, name)")
      .order("name", { ascending: true })
      .overrideTypes<CategoryQueryRow[], { merge: false }>(),
  ]);

  if (contractorError || categoryError || !contractorRows || !categoryRows) {
    console.error("Unable to load contractors", contractorError ?? categoryError);
    return { categories: [], contractors: [], error: true };
  }

  return {
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      colorKey: category.color_key,
      subcategories: [...category.subcategories].sort((first, second) => first.name.localeCompare(second.name, "uk")),
    })),
    contractors: contractorRows.map((contractor) => ({
      ...contractor,
      category: {
        id: contractor.category.id,
        name: contractor.category.name,
        colorKey: contractor.category.color_key,
        subcategories: [],
      },
    })),
    error: false,
  };
}
