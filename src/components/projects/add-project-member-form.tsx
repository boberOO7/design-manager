"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import type { AssignableStudioMember } from "@/data/queries/project-members";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import {
  addProjectMember,
  type ProjectMemberActionState,
} from "@/app/(app)/projects/[projectId]/member-actions";

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
    <form action={formAction} autoComplete="off" className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("studioMember")}
          <Select name="profile_id" required placeholder={t("selectMember")} disabled={isPending}>
            {assignableMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.full_name}{member.job_title ? ` — ${roleLabel(member.job_title)}` : ""}
              </SelectItem>
            ))}
          </Select>
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
