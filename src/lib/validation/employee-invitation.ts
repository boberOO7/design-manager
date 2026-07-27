import { z } from "zod";

export const employeeInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address")
    .transform((email) => email.toLowerCase()),
  full_name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(120, "Full name is too long"),
  job_title: z
    .string()
    .trim()
    .min(2, "Job title must be at least 2 characters")
    .max(100, "Job title is too long"),
});

export type EmployeeInvitationValues = z.infer<typeof employeeInvitationSchema>;
export type EmployeeInvitationField = keyof EmployeeInvitationValues;

export type EmployeeInvitationActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<EmployeeInvitationField, string>>;
  success?: string;
};

function getFormString(formData: FormData, field: EmployeeInvitationField) {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getEmployeeInvitationInput(formData: FormData) {
  return {
    email: getFormString(formData, "email"),
    full_name: getFormString(formData, "full_name"),
    job_title: getFormString(formData, "job_title"),
  };
}
