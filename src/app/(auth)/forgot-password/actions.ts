"use server";

import { getAuthConfirmationUrl } from "@/lib/auth/confirmation-url";
import { createClient } from "@/lib/supabase/server";
import {
  getPasswordRecoveryInput,
  passwordRecoverySchema,
  type PasswordRecoveryActionState,
} from "@/lib/validation/password-recovery";
import { headers } from "next/headers";

const neutralSuccessMessage =
  "If an account exists for that email, a password recovery link has been sent.";

export async function requestPasswordRecovery(
  _previousState: PasswordRecoveryActionState,
  formData: FormData,
): Promise<PasswordRecoveryActionState> {
  const parsed = passwordRecoverySchema.safeParse(getPasswordRecoveryInput(formData));
  if (!parsed.success) {
    return {
      formError: "Enter a valid email address.",
      fieldErrors: { email: parsed.error.flatten().fieldErrors.email?.[0] },
    };
  }

  const requestHeaders = await headers();
  const redirectTo = getAuthConfirmationUrl(requestHeaders.get("origin"));

  if (!redirectTo) {
    console.error("Unable to build the password recovery confirmation URL.");
    return { success: neutralSuccessMessage };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    console.error("Unable to request Supabase password recovery", {
      code: error.code,
      status: error.status,
    });
  }

  return { success: neutralSuccessMessage };
}
