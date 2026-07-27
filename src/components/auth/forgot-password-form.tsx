"use client";

import { requestPasswordRecovery } from "@/app/(auth)/forgot-password/actions";
import { Button } from "@/components/ui/button";
import type { PasswordRecoveryActionState } from "@/lib/validation/password-recovery";
import { useActionState } from "react";

const inputClassName =
  "mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<PasswordRecoveryActionState, FormData>(
    requestPasswordRecovery,
    {},
  );
  const emailError = state.fieldErrors?.email;

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <label className="block text-left text-sm font-medium text-stone-700">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "recovery-email-error" : undefined}
          className={inputClassName}
        />
        {emailError ? (
          <p id="recovery-email-error" className="mt-1.5 text-sm text-red-600">{emailError}</p>
        ) : null}
      </label>

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </div>
      ) : null}
      {state.success ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.success}
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Sending recovery link…" : "Send recovery link"}
      </Button>
    </form>
  );
}
