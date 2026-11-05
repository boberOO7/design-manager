import { describe, expect, it } from "vitest";
import { createContractorCategoryNameSchema, createContractorSchema, getContractorFormInput } from "@/lib/validation/contractor";

const messages = {
  categoryRequired: "category required", categoryTooLong: "category too long", subcategoryTooLong: "subcategory too long", nameRequired: "name required", nameTooLong: "name too long", websiteTooLong: "website too long", websiteInvalid: "website invalid", phoneTooLong: "phone too long", phoneInvalid: "phone invalid", descriptionTooLong: "description too long",
};

describe("contractor validation", () => {
  it("accepts only the two cooperation statuses and leaves omitted status untouched", () => {
    const schema = createContractorSchema(messages);
    const input = { category: "Electrical", name: "Acme" };
    expect(schema.parse(input).cooperation_status).toBeUndefined();
    for (const cooperation_status of ["verified", "prospective"]) expect(schema.parse({ ...input, cooperation_status }).cooperation_status).toBe(cooperation_status);
    expect(schema.safeParse({ ...input, cooperation_status: "unknown" }).success).toBe(false);
    const form = new FormData();
    form.set("cooperation_status", "prospective");
    expect(getContractorFormInput(form).cooperation_status).toBe("prospective");
    expect(schema.safeParse({ ...input, is_recommended: true }).success).toBe(false);
  });
  it("trims category names and rejects empty or overlong rename values", () => {
    const schema = createContractorCategoryNameSchema(messages);

    expect(schema.parse("  Electrical  ")).toBe("Electrical");
    expect(schema.safeParse("   ").success).toBe(false);
    expect(schema.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("accepts a category-only contractor and normalizes an optional subcategory", () => {
    const result = createContractorSchema(messages).safeParse({ category: " Electrical ", subcategory: " Lighting ", name: "Acme" });
    expect(result.success && result.data).toMatchObject({ category: "Electrical", subcategory: "Lighting" });
  });

  it("rejects a subcategory longer than the normalized model permits", () => {
    const result = createContractorSchema(messages).safeParse({ category: "Electrical", subcategory: "x".repeat(101), name: "Acme" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.subcategory).toEqual(["subcategory too long"]);
  });

  it("includes the optional subcategory form field", () => {
    const formData = new FormData();
    formData.set("category", "Electrical");
    formData.set("subcategory", "Lighting");
    expect(getContractorFormInput(formData).subcategory).toBe("Lighting");
  });
});
