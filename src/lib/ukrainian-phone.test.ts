import { describe, expect, it } from "vitest";
import { formatUkrainianPhone, getUkrainianPhoneDigits, normalizeUkrainianPhone } from "./ukrainian-phone";
import { createContractorSchema } from "./validation/contractor";

const contractorSchema = createContractorSchema({
  categoryRequired: "Enter a category.", categoryTooLong: "The category is too long.",
  subcategoryTooLong: "The subcategory is too long.",
  nameRequired: "Enter a company name.", nameTooLong: "The company name is too long.",
  websiteTooLong: "The link is too long.", websiteInvalid: "Enter a complete link.",
  phoneTooLong: "The phone number is too long.", phoneInvalid: "Enter the full phone number.",
  descriptionTooLong: "The description is too long.",
});

describe("Ukrainian contractor phone numbers", () => {
  const pastedFormats = ["+380671234567", "380671234567", "0671234567", "67 123 45 67", "+380 (67) 123-45-67"];

  it("normalizes common pasted formats to the database shape", () => {
    for (const phone of pastedFormats) expect(normalizeUkrainianPhone(phone)).toBe("+380671234567");
  });

  it("formats the editable value and limits input to nine digits after +380", () => {
    expect(formatUkrainianPhone("+380671234567")).toBe("+380 (67) 123-45-67");
    expect(getUkrainianPhoneDigits("+38067123456789")).toBe("671234567");
  });

  it("allows an empty phone and rejects partial or non-phone values", () => {
    const base = { category: "Освітлення", name: "Світло" };
    expect(contractorSchema.parse({ ...base, phone: "" }).phone).toBeUndefined();
    expect(contractorSchema.safeParse({ ...base, phone: "+380 (67) 123" }).success).toBe(false);
    expect(contractorSchema.safeParse({ ...base, phone: "телефон 671234567" }).success).toBe(false);
  });

  it("normalizes a submitted phone before persistence", () => {
    expect(contractorSchema.parse({ category: "Освітлення", name: "Світло", phone: "+380 (67) 123-45-67" }).phone).toBe("+380671234567");
  });
});
