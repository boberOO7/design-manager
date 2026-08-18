import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ContractorCategory = { id: string; name: string; colorKey: string };

export type Contractor = {
  id: string;
  category: ContractorCategory;
  name: string;
  website_url: string | null;
  phone: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function getContractors(): Promise<{ contractors: Contractor[]; error: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contractors")
    .select("id, category:contractor_categories!inner(id, name, color_key), name, website_url, phone, description, created_by, created_at, updated_at")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("Unable to load contractors", error);
    return { contractors: [], error: true };
  }

  return {
    contractors: data.map((contractor) => ({
      ...contractor,
      category: {
        id: contractor.category.id,
        name: contractor.category.name,
        colorKey: contractor.category.color_key,
      },
    })),
    error: false,
  };
}
