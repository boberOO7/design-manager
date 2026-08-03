"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AssignableStudioMember } from "@/data/queries/project-members";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import {
  addProjectMember,
  type ProjectMemberActionState,
} from "@/app/(app)/projects/[projectId]/member-actions";

const selectClassName =
  "h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]";

export function AddProjectMemberForm({
  assignableMembers,
  projectId,
}: {
  assignableMembers: AssignableStudioMember[];
  projectId: string;
}) {
  const t = useTranslations("ProjectWorkspace");
  const roles = useTranslations("Roles");
  const roleLabel = (value: string) => { const roleKey = getCanonicalRoleTranslationKey(value); return roleKey ? roles(roleKey) : value; };
  const action = addProjectMember.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ProjectMemberActionState, FormData>(
    action,
    {},
  );

  if (assignableMembers.length === 0) {
    return <p className="text-sm text-[var(--ui-text-muted)]">{t("allAssigned")}</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("studioMember")}
          <select name="profile_id" defaultValue="" required className={selectClassName} disabled={isPending}>
            <option value="" disabled>{t("selectMember")}</option>
            {assignableMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}{member.job_title ? ` — ${roleLabel(member.job_title)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={isPending} className="w-full md:w-auto">
            {isPending ? t("adding") : t("addMember")}
          </Button>
        </div>
      </div>
      {state.formError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}
    </form>
  );
}
