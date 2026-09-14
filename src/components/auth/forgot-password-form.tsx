"use client";

import { requestPasswordRecovery } from "@/app/(auth)/forgot-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import type { PasswordRecoveryActionState } from "@/lib/validation/password-recovery";
import { useActionState } from "react";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<PasswordRecoveryActionState, FormData>(
    requestPasswordRecovery,
    {},
  );
  const emailError = state.fieldErrors?.email;

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <label className="block text-left text-sm font-medium text-[var(--ui-text-secondary)]">
        Email
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "recovery-email-error" : undefined}
          className="mt-2"
        />
        {emailError ? (
          <p id="recovery-email-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{emailError}</p>
        ) : null}
      </label>

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">
          {state.formError}
        </div>
      ) : null}
      {state.success ? (
        <div role="status" className="rounded-xl border border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] px-4 py-3 text-sm text-[var(--ui-success-text)]">
          {state.success}
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Sending recovery link…" : "Send recovery link"}
      </Button>
    </form>
  );
}
