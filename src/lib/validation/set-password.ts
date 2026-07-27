import { z } from "zod";

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(128, "Password is too long"),
    password_confirmation: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
export type SetPasswordField = keyof SetPasswordValues;

export type SetPasswordActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<SetPasswordField, string>>;
};

export function getSetPasswordInput(formData: FormData) {
  const password = formData.get("password");
  const passwordConfirmation = formData.get("password_confirmation");

  return {
    password: typeof password === "string" ? password : undefined,
    password_confirmation:
      typeof passwordConfirmation === "string" ? passwordConfirmation : undefined,
  };
}
