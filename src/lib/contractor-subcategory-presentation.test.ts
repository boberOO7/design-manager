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
  it("exposes a category's subcategories or the studio-wide options, resetting only incompatible filters", () => {
    expect(getContractorSubcategories(categories, "electrical").map((item) => item.id)).toEqual(["lighting", "low-voltage"]);
    expect(getContractorSubcategories(categories, "").map((item) => item.id)).toEqual(["heating", "lighting", "low-voltage"]);
    expect(changeContractorCategoryFilter(categories, "plumbing", "lighting")).toEqual({ categoryId: "plumbing", subcategoryId: "" });
    expect(changeContractorCategoryFilter(categories, "", "lighting")).toEqual({ categoryId: "", subcategoryId: "lighting" });
  });

  it("keeps category-only contractors visible and narrows only by a matching subcategory", () => {
    const contractors = [contractor({ id: "category-only" }), contractor({ id: "lighting", subcategory: categories[0].subcategories[0] })];
    expect(filterContractors(contractors, { categoryId: "electrical", subcategoryId: "", query: "" }).map((item) => item.id)).toEqual(["category-only", "lighting"]);
    expect(filterContractors(contractors, { categoryId: "electrical", subcategoryId: "lighting", query: "" }).map((item) => item.id)).toEqual(["lighting"]);
  });

  it("renders subcategory as its own neutral table column", async () => {
    const directoryPath = new URL("../components/contractors/contractor-directory.tsx", import.meta.url);
    const source = await readFile(directoryPath, "utf8");
    expect(source).toContain('t("columns.subcategory")');
    expect(source).toContain('border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-muted)]');
    expect(source).toContain('<span className="text-[var(--ui-text-muted)]">—</span>');
    expect(source).not.toContain('aria-hidden="true" className="text-xs leading-none text-[var(--ui-text-muted)]">›</span>');
    expect(source).toContain('text-xs font-normal leading-5 text-[var(--ui-text-secondary)]" title={contractor.subcategory.name}');
  });

  it("keeps dynamic category badges contained and discoverable in the category filter", async () => {
    const directoryPath = new URL("../components/contractors/contractor-directory.tsx", import.meta.url);
    const source = await readFile(directoryPath, "utf8");

    expect(source).toContain('className="block min-w-0"');
    expect(source).toContain('inline-flex max-w-full min-w-0 items-center rounded-full');
    expect(source).toContain('className="min-w-0 truncate whitespace-nowrap">{item.name}</span>');
    expect(source).toContain('title={item.name}');
  });
});
