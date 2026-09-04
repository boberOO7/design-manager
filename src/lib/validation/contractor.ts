import { z } from "zod";
import { normalizeUkrainianPhone } from "@/lib/ukrainian-phone";

export type ContractorValidationMessages = {
  categoryRequired: string;
  categoryTooLong: string;
  subcategoryTooLong: string;
  nameRequired: string;
  nameTooLong: string;
  websiteTooLong: string;
  websiteInvalid: string;
  phoneTooLong: string;
  phoneInvalid: string;
  descriptionTooLong: string;
};

export function createContractorCategoryNameSchema(messages: Pick<ContractorValidationMessages, "categoryRequired" | "categoryTooLong">) {
  return z.string().trim().min(1, messages.categoryRequired).max(100, messages.categoryTooLong);
}

export function createContractorSchema(messages: ContractorValidationMessages) {
  const optionalText = (maximum: number, message: string) => z.string().trim().max(maximum, message).optional();
  return z.object({
  category: createContractorCategoryNameSchema(messages),
  subcategory: optionalText(100, messages.subcategoryTooLong),
  name: z.string().trim().min(1, messages.nameRequired).max(200, messages.nameTooLong),
  website_url: optionalText(500, messages.websiteTooLong).refine(
    (value) => !value || /^https?:\/\//i.test(value),
    messages.websiteInvalid,
  ),
  phone: z.string().trim().max(32, messages.phoneTooLong).optional().transform((value, context) => {
    if (!value) return undefined;
    const phone = normalizeUkrainianPhone(value);
    if (phone) return phone;
    context.addIssue({ code: "custom", message: messages.phoneInvalid });
    return z.NEVER;
  }),
  description: optionalText(1000, messages.descriptionTooLong),
  }).strict();
}

export type ContractorFormValues = z.infer<ReturnType<typeof createContractorSchema>>;
export type ContractorFormField = keyof ContractorFormValues;

export type ContractorFormActionState = {
  contractorId?: string;
  formError?: string;
  fieldErrors?: Partial<Record<ContractorFormField, string>>;
};

function getString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getContractorFormInput(formData: FormData) {
  return {
    category: getString(formData, "category"),
    subcategory: getString(formData, "subcategory"),
    name: getString(formData, "name"),
    website_url: getString(formData, "website_url"),
    phone: getString(formData, "phone"),
    description: getString(formData, "description"),
  };
}
