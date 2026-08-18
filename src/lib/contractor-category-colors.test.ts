import { describe, expect, it } from "vitest";
import { getContractorCategoryBadgeClassName, isContractorCategoryColorKey } from "@/lib/contractor-category-colors";

describe("contractor category colors", () => {
  it("recognizes the persistent category palette keys", () => {
    expect(isContractorCategoryColorKey("bronze")).toBe(true);
    expect(isContractorCategoryColorKey("amber")).toBe(false);
    expect(isContractorCategoryColorKey("not-a-color")).toBe(false);
  });

  it("returns a semantic badge treatment without component hex values", () => {
    expect(getContractorCategoryBadgeClassName("bronze")).toContain("--ui-category-bronze-surface");
    expect(getContractorCategoryBadgeClassName("unknown")).toContain("--ui-surface-muted");
  });
});
