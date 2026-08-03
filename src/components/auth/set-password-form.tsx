"use client";

import { setUserPassword } from "@/app/(auth)/set-password/actions";
import { Button } from "@/components/ui/button";
import type {
  SetPasswordActionState,
  SetPasswordField,
} from "@/lib/validation/set-password";
import { useActionState } from "react";

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]";

export function SetPasswordForm() {
  const [state, formAction, isPending] = useActionState<SetPasswordActionState, FormData>(
    setUserPassword,
    {},
  );
  const fieldError = (field: SetPasswordField) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <label className="block text-left text-sm font-medium text-[var(--ui-text-secondary)]">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          disabled={isPending}
          aria-invalid={fieldError("password") ? true : undefined}
          aria-describedby={fieldError("password") ? "password-error" : "password-help"}
          className={inputClassName}
        />
        <p id="password-help" className="mt-1.5 text-xs text-[var(--ui-text-muted)]">Use at least 6 characters.</p>
        {fieldError("password") ? (
          <p id="password-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("password")}</p>
        ) : null}
      </label>

      <label className="block text-left text-sm font-medium text-[var(--ui-text-secondary)]">
        Confirm password
        <input
          name="password_confirmation"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          disabled={isPending}
          aria-invalid={fieldError("password_confirmation") ? true : undefined}
          aria-describedby={fieldError("password_confirmation") ? "password-confirmation-error" : undefined}
          className={inputClassName}
        />
        {fieldError("password_confirmation") ? (
          <p id="password-confirmation-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">
            {fieldError("password_confirmation")}
          </p>
        ) : null}
      </label>

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">
          {state.formError}
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Setting password…" : "Set password and continue"}
      </Button>
    </form>
  );
}
