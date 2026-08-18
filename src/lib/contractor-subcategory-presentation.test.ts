import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { changeContractorCategoryFilter, filterContractors, getContractorSubcategories } from "@/lib/contractor-subcategory-presentation";
import type { Contractor, ContractorCategory } from "@/data/queries/contractors";

const categories: ContractorCategory[] = [
  { id: "electrical", name: "Electrical", colorKey: "blue", subcategories: [{ id: "lighting", name: "Lighting" }, { id: "low-voltage", name: "Low voltage" }] },
  { id: "plumbing", name: "Plumbing", colorKey: "teal", subcategories: [{ id: "heating", name: "Heating" }] },
];

function contractor(overrides: Partial<Contractor>): Contractor {
  return { id: "one", category: categories[0], subcategory: null, name: "Acme", website_url: null, phone: null, description: null, created_by: "user", created_at: "2026-08-18", updated_at: "2026-08-18", ...overrides };
}

describe("contractor subcategory presentation", () => {
  it("exposes only the selected category's subcategories and resets a dependent filter", () => {
    expect(getContractorSubcategories(categories, "electrical").map((item) => item.id)).toEqual(["lighting", "low-voltage"]);
    expect(getContractorSubcategories(categories, "")).toEqual([]);
    expect(changeContractorCategoryFilter("plumbing")).toEqual({ categoryId: "plumbing", subcategoryId: "" });
  });

  it("keeps category-only contractors visible and narrows only by a matching subcategory", () => {
    const contractors = [contractor({ id: "category-only" }), contractor({ id: "lighting", subcategory: categories[0].subcategories[0] })];
    expect(filterContractors(contractors, { categoryId: "electrical", subcategoryId: "", query: "" }).map((item) => item.id)).toEqual(["category-only", "lighting"]);
    expect(filterContractors(contractors, { categoryId: "electrical", subcategoryId: "lighting", query: "" }).map((item) => item.id)).toEqual(["lighting"]);
  });

  it("renders a selected subcategory as muted text rather than a category-color badge", async () => {
    const directoryPath = new URL("../components/contractors/contractor-directory.tsx", import.meta.url);
    const source = await readFile(directoryPath, "utf8");
    expect(source).toContain('contractor.subcategory ? <span className="text-sm text-[var(--ui-text-secondary)]">');
  });
});
