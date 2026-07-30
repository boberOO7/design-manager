"use client";

import { inviteEmployee } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import {
  PROFESSIONAL_ROLES,
  type EmployeeInvitationActionState,
  type EmployeeInvitationField,
} from "@/lib/validation/employee-invitation";
import { ChevronDown, UserPlus } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";

const inputClassName =
  "mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function InviteEmployeeForm() {
  const [state, formAction, isPending] = useActionState<
    EmployeeInvitationActionState,
    FormData
  >(inviteEmployee, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const fieldError = (field: EmployeeInvitationField) => state.fieldErrors?.[field];
  const errorAttributes = (field: EmployeeInvitationField) => ({
    "aria-describedby": fieldError(field) ? `invite-${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });

  return (
    <section aria-labelledby="invite-employee-heading">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 id="invite-employee-heading" className="font-semibold text-stone-900">
            Invite an employee
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Add a Designer or Architect to this studio.
          </p>
        </div>
        <Button
          type="button"
          variant={isOpen ? "outline" : "default"}
          className="w-full shrink-0 sm:w-auto"
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={isPending}
          onClick={() => setIsOpen((open) => !open)}
        >
          <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
          {isOpen ? "Close invitation" : "Invite employee"}
          <ChevronDown
            aria-hidden="true"
            className={`ml-2 h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {isOpen ? (
        <form
          id={panelId}
          ref={formRef}
          action={formAction}
          className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
          noValidate
        >
          <fieldset disabled={isPending}>
            <legend className="sr-only">Employee invitation details</legend>
            <p className="mb-4 text-sm text-stone-600">
              New employees receive studio access only. Assign projects separately when they are ready.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block text-sm font-medium text-stone-700">
                Employee email <span className="text-red-600">*</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
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
                Professional role <span className="text-red-600">*</span>
                <select
                  name="job_title"
                  required
                  className={inputClassName}
                  {...errorAttributes("job_title")}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a professional role
                  </option>
                  {PROFESSIONAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {fieldError("job_title") ? (
                  <p id="invite-job_title-error" className="mt-1.5 text-sm text-red-600">
                    {fieldError("job_title")}
                  </p>
                ) : null}
              </label>
            </div>
          </fieldset>

          {state.formError ? (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.formError}
            </div>
          ) : null}
          {state.success ? (
            <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {state.success}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end border-t border-stone-200 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending invitation…" : "Invite employee"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
