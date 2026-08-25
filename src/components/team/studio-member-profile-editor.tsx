"use client";

import { updateStudioMemberProfile } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";
import {
  getProfileNameParts,
  STUDIO_ACCESS_ROLES,
  type StudioMemberProfileActionState,
  type StudioMemberProfileField,
} from "@/lib/validation/team-member-profile";
import type { SystemRole } from "@/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, type RefObject } from "react";

const inputClassName = "mt-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)] aria-invalid:border-[var(--ui-danger-border)]";

export function StudioMemberProfileEditor({ fullName, isOpen, jobTitle, onRequestClose, returnFocusRef, systemRole, userId }: {
  fullName: string;
  isOpen: boolean;
  jobTitle: string | null;
  onRequestClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  systemRole: SystemRole;
  userId: string;
}) {
  const t = useTranslations("Team");
  const roles = useTranslations("Roles");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const hasRefreshedAfterSave = useRef(false);
  const [state, formAction, pending] = useActionState<StudioMemberProfileActionState, FormData>(updateStudioMemberProfile, {});
  const { firstName, lastName } = getProfileNameParts(fullName);

  useEffect(() => {
    if (!state.success || hasRefreshedAfterSave.current) return;
    hasRefreshedAfterSave.current = true;
    onRequestClose();
    router.refresh();
  }, [onRequestClose, router, state.success]);

  const fieldError = (field: StudioMemberProfileField) => state.fieldErrors?.[field];
  const errorAttributes = (field: StudioMemberProfileField) => ({
    "aria-describedby": fieldError(field) ? `team-profile-${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });

  return <Dialog closeDisabled={pending} closeLabel={t("cancel")} description={t("editTeamMemberDescription")} isOpen={isOpen} onRequestClose={() => { if (!pending) onRequestClose(); }} returnFocusRef={returnFocusRef} title={t("editTeamMember")}>
    <form ref={formRef} action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><input name="userId" type="hidden" value={userId} />
        <fieldset disabled={pending}>
          <legend className="sr-only">{t("editProfile")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("firstName")}<input autoComplete="given-name" className={inputClassName} defaultValue={firstName} name="firstName" required {...errorAttributes("firstName")} />{fieldError("firstName") ? <p id="team-profile-firstName-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{t("correctFields")}</p> : null}</label>
            <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("lastName")}<input autoComplete="family-name" className={inputClassName} defaultValue={lastName} name="lastName" required {...errorAttributes("lastName")} />{fieldError("lastName") ? <p id="team-profile-lastName-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{t("correctFields")}</p> : null}</label>
            <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("profession")}<Select defaultValue={jobTitle ?? undefined} name="jobTitle" required className="mt-2" {...errorAttributes("jobTitle")} placeholder={t("selectRole")}>{PROFESSIONAL_ROLES.map((role) => <SelectItem key={role} value={role}>{roles(getCanonicalRoleTranslationKey(role) ?? "designer")}</SelectItem>)}</Select>{fieldError("jobTitle") ? <p id="team-profile-jobTitle-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{t("correctFields")}</p> : null}</label>
            <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("role")}<Select defaultValue={systemRole} name="systemRole" required className="mt-2" {...errorAttributes("systemRole")}>{STUDIO_ACCESS_ROLES.map((role) => <SelectItem key={role} value={role}>{role === "admin" ? roles("administrator") : t("employee")}</SelectItem>)}</Select>{fieldError("systemRole") ? <p id="team-profile-systemRole-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{t("correctFields")}</p> : null}</label>
          </div>
        </fieldset>
        {state.formError ? <p role="alert" className="mt-4 rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">{t("profileUpdateFailed")}</p> : null}
      </div>
      <footer className="flex shrink-0 justify-end gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6"><Button disabled={pending} onClick={onRequestClose} type="button" variant="outline">{t("cancel")}</Button><Button disabled={pending} type="submit">{pending ? t("saving") : t("save")}</Button></footer>
    </form>
  </Dialog>;
}
