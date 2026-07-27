"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getSetPasswordInput,
  setPasswordSchema,
  type SetPasswordActionState,
  type SetPasswordField,
} from "@/lib/validation/set-password";
import { redirect } from "next/navigation";

export async function setUserPassword(
  _previousState: SetPasswordActionState,
  formData: FormData,
): Promise<SetPasswordActionState> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { formError: "Your password setup session is invalid or has expired. Request a new recovery link." };
  }

  const parsed = setPasswordSchema.safeParse(getSetPasswordInput(formData));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<SetPasswordField, string>> = {};

    const fields = ["password", "password_confirmation"] satisfies SetPasswordField[];
    for (const field of fields) {
      const message = flattened[field]?.[0];
      if (message) fieldErrors[field] = message;
    }

    return { formError: "Please correct the highlighted fields.", fieldErrors };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("Unable to set employee password", {
      code: error.code,
      status: error.status,
    });
    return {
      formError: error.code === "weak_password"
        ? "Choose a stronger password that meets the security requirements."
        : "Your password could not be set. The invitation may have expired.",
    };
  }

  redirect("/dashboard");
}
