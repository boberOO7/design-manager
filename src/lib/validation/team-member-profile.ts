import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";
import type { SystemRole } from "@/types";
import { z } from "zod";

export const STUDIO_ACCESS_ROLES = ["employee", "admin"] as const satisfies readonly SystemRole[];

export const studioMemberProfileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, "First name is required").max(60, "First name is too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(60, "Last name is too long"),
  jobTitle: z.enum(PROFESSIONAL_ROLES, { error: "Choose a supported profession" }),
  systemRole: z.enum(STUDIO_ACCESS_ROLES, { error: "Choose a supported access role" }),
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
  };
}

export function getProfileNameParts(fullName: string) {
  const [firstName = "", ...lastNameParts] = fullName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
}

export function getFullName({ firstName, lastName }: Pick<StudioMemberProfileInput, "firstName" | "lastName">) {
  return [firstName, lastName].map((part) => part.trim()).join(" ");
}
