"use client";

import { inviteEmployee } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import type {
  EmployeeInvitationActionState,
  EmployeeInvitationField,
} from "@/lib/validation/employee-invitation";
import { useActionState, useEffect, useRef } from "react";

const inputClassName =
  "mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function InviteEmployeeForm() {
  const [state, formAction, isPending] = useActionState<
    EmployeeInvitationActionState,
    FormData
  >(inviteEmployee, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const fieldError = (field: EmployeeInvitationField) => state.fieldErrors?.[field];
  const errorAttributes = (field: EmployeeInvitationField) => ({
    "aria-describedby": fieldError(field) ? `invite-${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Employee email <span className="text-red-600">*</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={isPending}
            className={inputClassName}
            {...errorAttributes("email")}
          />
          {fieldError("email") ? (
            <p id="invite-email-error" className="mt-1.5 text-sm text-red-600">
              {fieldError("email")}
            </p>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Full name <span className="text-red-600">*</span>
          <input
            name="full_name"
            required
            autoComplete="name"
            disabled={isPending}
            className={inputClassName}
            {...errorAttributes("full_name")}
          />
          {fieldError("full_name") ? (
            <p id="invite-full_name-error" className="mt-1.5 text-sm text-red-600">
              {fieldError("full_name")}
            </p>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Professional job title <span className="text-red-600">*</span>
          <input
            name="job_title"
            required
            autoComplete="organization-title"
            disabled={isPending}
            className={inputClassName}
            {...errorAttributes("job_title")}
          />
          {fieldError("job_title") ? (
            <p id="invite-job_title-error" className="mt-1.5 text-sm text-red-600">
              {fieldError("job_title")}
            </p>
          ) : null}
        </label>
      </div>

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

      <div className="flex justify-end border-t border-stone-200 pt-5">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending invitation…" : "Invite employee"}
        </Button>
      </div>
    </form>
  );
}
