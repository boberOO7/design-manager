import type { Contractor, ContractorCategory, ContractorSubcategory } from "@/data/queries/contractors";

export type ContractorDirectoryFilters = { categoryId: string; subcategoryId: string; query: string };
export type ContractorDirectorySort = { column: "name" | "category" | "subcategory"; direction: "asc" | "desc" };

export function sortContractors(contractors: readonly Contractor[], sort: ContractorDirectorySort, locale: string): Contractor[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...contractors].sort((first, second) => {
    const firstValue = sort.column === "name" ? first.name : sort.column === "category" ? first.category.name : first.subcategory?.name;
    const secondValue = sort.column === "name" ? second.name : sort.column === "category" ? second.category.name : second.subcategory?.name;
    if (firstValue === undefined || secondValue === undefined) return Number(firstValue === undefined) - Number(secondValue === undefined) || collator.compare(first.name, second.name);
    return direction * collator.compare(firstValue, secondValue) || collator.compare(first.name, second.name);
  });
}

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
