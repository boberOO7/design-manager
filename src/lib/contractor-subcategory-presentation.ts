import type { Contractor, ContractorCategory, ContractorSubcategory } from "@/data/queries/contractors";

export type ContractorDirectoryFilters = { categoryId: string; subcategoryId: string; query: string };

export function getContractorSubcategories(categories: readonly ContractorCategory[], categoryId: string): readonly ContractorSubcategory[] {
  const subcategories = categoryId
    ? categories.find((category) => category.id === categoryId)?.subcategories ?? []
    : categories.flatMap((category) => category.subcategories);
  return [...subcategories].sort((first, second) => first.name.localeCompare(second.name, "uk"));
}

export function changeContractorCategoryFilter(categories: readonly ContractorCategory[], categoryId: string, subcategoryId: string): Pick<ContractorDirectoryFilters, "categoryId" | "subcategoryId"> {
  const isCompatible = getContractorSubcategories(categories, categoryId).some((subcategory) => subcategory.id === subcategoryId);
  return { categoryId, subcategoryId: isCompatible ? subcategoryId : "" };
}

export function filterContractors(contractors: readonly Contractor[], filters: ContractorDirectoryFilters): Contractor[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return contractors.filter((contractor) =>
    (!filters.categoryId || contractor.category.id === filters.categoryId)
    && (!filters.subcategoryId || contractor.subcategory?.id === filters.subcategoryId)
    && (!query || contractor.name.toLocaleLowerCase().includes(query)),
  );
}
