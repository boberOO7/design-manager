"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  removeProjectMember,
  type ProjectMemberActionState,
} from "@/app/(app)/projects/[projectId]/member-actions";

export function RemoveProjectMemberButton({
  assignmentId,
  memberName,
  projectId,
}: {
  assignmentId: string;
  memberName: string;
  projectId: string;
}) {
  const t = useTranslations("ProjectWorkspace");
  const action = removeProjectMember.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ProjectMemberActionState, FormData>(
    action,
    {},
  );

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(t("removeMember", { name: memberName }))) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <Button type="submit" size="sm" variant="ghost" disabled={isPending}>
          {isPending ? t("removing") : t("remove")}
        </Button>
      </form>
      {state.formError ? (
        <p role="alert" className="text-right text-sm text-[var(--ui-danger-text)]">{state.formError}</p>
      ) : null}
    </div>
  );
}
