import { z } from "zod";

const optionalText = (maximum: number, message: string) => z.string().trim().max(maximum, message).optional();

export const contractorSchema = z.object({
  category: z.string().trim().min(1, "Вкажіть категорію").max(100, "Категорія занадто довга"),
  name: z.string().trim().min(1, "Уведіть назву фірми").max(200, "Назва занадто довга"),
  website_url: optionalText(500, "Посилання занадто довге").refine(
    (value) => !value || /^https?:\/\//i.test(value),
    "Уведіть повне посилання з http:// або https://",
  ),
  phone: optionalText(100, "Телефон занадто довгий"),
  description: optionalText(1000, "Опис занадто довгий"),
}).strict();

export type ContractorFormValues = z.infer<typeof contractorSchema>;
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
    name: getString(formData, "name"),
    website_url: getString(formData, "website_url"),
    phone: getString(formData, "phone"),
    description: getString(formData, "description"),
  };
}
