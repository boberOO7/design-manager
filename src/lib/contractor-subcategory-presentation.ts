import type { Contractor, ContractorCategory, ContractorSubcategory } from "@/data/queries/contractors";

export type ContractorDirectoryFilters = { categoryId: string; subcategoryId: string; query: string };

export function getContractorSubcategories(categories: readonly ContractorCategory[], categoryId: string): readonly ContractorSubcategory[] {
  return categories.find((category) => category.id === categoryId)?.subcategories ?? [];
}

export function changeContractorCategoryFilter(categoryId: string): Pick<ContractorDirectoryFilters, "categoryId" | "subcategoryId"> {
  return { categoryId, subcategoryId: "" };
}

export function filterContractors(contractors: readonly Contractor[], filters: ContractorDirectoryFilters): Contractor[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return contractors.filter((contractor) =>
    (!filters.categoryId || contractor.category.id === filters.categoryId)
    && (!filters.subcategoryId || contractor.subcategory?.id === filters.subcategoryId)
    && (!query || contractor.name.toLocaleLowerCase().includes(query)),
  );
}
