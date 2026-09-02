import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";
import { isCountryCode } from "@/lib/countries";
import type { SystemRole } from "@/types";
import { z } from "zod";

export const STUDIO_ACCESS_ROLES = ["employee", "admin"] as const satisfies readonly SystemRole[];

const optionalDateSchema = z.union([z.iso.date(), z.literal("")]).transform((value) => value || null);
const optionalCountryCodeSchema = z.string().trim().transform((value) => value ? value.toUpperCase() : null)
  .refine((value) => value === null || isCountryCode(value), "Choose a valid country");
const optionalCitySchema = z.string().trim().transform((value) => value || null);
const optionalCityGeoNamesIdSchema = z.preprocess((value) => value === "" || value === undefined ? null : value, z.coerce.number().int().positive().nullable());

export const studioMemberProfileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, "First name is required").max(60, "First name is too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(60, "Last name is too long"),
  jobTitle: z.enum(PROFESSIONAL_ROLES, { error: "Choose a supported profession" }),
  systemRole: z.enum(STUDIO_ACCESS_ROLES, { error: "Choose a supported access role" }),
  joinedAt: optionalDateSchema,
  birthDate: optionalDateSchema,
  countryCode: optionalCountryCodeSchema,
  city: optionalCitySchema,
  cityGeoNamesId: optionalCityGeoNamesIdSchema,
}).superRefine((value, context) => {
  if (value.city && !value.countryCode) context.addIssue({ code: "custom", message: "Choose a country before saving a city.", path: ["countryCode"] });
  if (value.cityGeoNamesId && !value.city) context.addIssue({ code: "custom", message: "A city is required for its GeoNames identifier.", path: ["city"] });
});

export type StudioMemberProfileInput = z.infer<typeof studioMemberProfileSchema>;
export type StudioMemberProfileField = keyof StudioMemberProfileInput;
export type StudioMemberProfileActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<StudioMemberProfileField, string>>;
  success?: true;
};

function getFormString(formData: FormData, field: StudioMemberProfileField) {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getStudioMemberProfileInput(formData: FormData) {
  return {
    userId: getFormString(formData, "userId"),
    firstName: getFormString(formData, "firstName"),
    lastName: getFormString(formData, "lastName"),
    jobTitle: getFormString(formData, "jobTitle"),
    systemRole: getFormString(formData, "systemRole"),
    joinedAt: getFormString(formData, "joinedAt"),
    birthDate: getFormString(formData, "birthDate"),
    countryCode: getFormString(formData, "countryCode") ?? "",
    city: getFormString(formData, "city") ?? "",
    cityGeoNamesId: getFormString(formData, "cityGeoNamesId"),
  };
}

export function getProfileNameParts(fullName: string) {
  const [firstName = "", ...lastNameParts] = fullName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
}

export function getFullName({ firstName, lastName }: Pick<StudioMemberProfileInput, "firstName" | "lastName">) {
  return [firstName, lastName].map((part) => part.trim()).join(" ");
}
