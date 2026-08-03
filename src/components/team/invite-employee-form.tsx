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
import { useTranslations } from "next-intl";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]";

export function InviteEmployeeForm() {
  const t = useTranslations("Team");
  const roles = useTranslations("Roles");
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
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 id="invite-employee-heading" className="font-semibold text-[var(--ui-text)]">
            {t("invite")}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">
            {t("inviteDescription")}
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
          {isOpen ? t("closeInvitation") : t("invite")}
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
          className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4 sm:p-5"
          noValidate
        >
          <fieldset disabled={isPending}>
            <legend className="sr-only">{t("invitationDetails")}</legend>
            <p className="mb-4 text-sm text-[var(--ui-text-secondary)]">
              {t("invitationDescription")}
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
                {t("email")} <span className="text-[var(--ui-danger-text)]">*</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClassName}
                  {...errorAttributes("email")}
                />
                {fieldError("email") ? (
                  <p id="invite-email-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">
                    {t("correctFields")}
                  </p>
                ) : null}
              </label>

              <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
                {t("fullName")} <span className="text-[var(--ui-danger-text)]">*</span>
                <input
                  name="full_name"
                  required
                  autoComplete="name"
                  className={inputClassName}
                  {...errorAttributes("full_name")}
                />
                {fieldError("full_name") ? (
                  <p id="invite-full_name-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">
                    {t("correctFields")}
                  </p>
                ) : null}
              </label>

              <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
                {t("professionalRole")} <span className="text-[var(--ui-danger-text)]">*</span>
                <select
                  name="job_title"
                  required
                  className={inputClassName}
                  {...errorAttributes("job_title")}
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t("selectRole")}
                  </option>
                  {PROFESSIONAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roles(getCanonicalRoleTranslationKey(role) ?? "designer")}
                    </option>
                  ))}
                </select>
                {fieldError("job_title") ? (
                  <p id="invite-job_title-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">
                    {t("correctFields")}
                  </p>
                ) : null}
              </label>
            </div>
          </fieldset>

          {state.formError ? (
            <div role="alert" className="mt-4 rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">
              {t("invitationFailed")}
            </div>
          ) : null}
          {state.success ? (
            <div role="status" className="mt-4 rounded-xl border border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] px-4 py-3 text-sm text-[var(--ui-success-text)]">
              {t("invitationSent")}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end border-t border-[var(--ui-border)] pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? t("sending") : t("sendInvitation")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
