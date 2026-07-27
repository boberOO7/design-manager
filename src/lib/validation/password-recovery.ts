import { z } from "zod";

export const passwordRecoverySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address")
    .transform((email) => email.toLowerCase()),
});

export type PasswordRecoveryField = "email";

export type PasswordRecoveryActionState = {
  fieldErrors?: Partial<Record<PasswordRecoveryField, string>>;
  formError?: string;
  success?: string;
};

export function getPasswordRecoveryInput(formData: FormData) {
  const email = formData.get("email");
  return { email: typeof email === "string" ? email : undefined };
}
