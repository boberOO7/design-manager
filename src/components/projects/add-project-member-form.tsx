"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { AssignableStudioMember } from "@/data/queries/project-members";
import {
  addProjectMember,
  type ProjectMemberActionState,
} from "@/app/(app)/projects/[projectId]/member-actions";

const selectClassName =
  "h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function AddProjectMemberForm({
  assignableMembers,
  projectId,
}: {
  assignableMembers: AssignableStudioMember[];
  projectId: string;
}) {
  const action = addProjectMember.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ProjectMemberActionState, FormData>(
    action,
    {},
  );

  if (assignableMembers.length === 0) {
    return <p className="text-sm text-stone-500">All active studio members are already assigned.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Studio member
          <select name="profile_id" defaultValue="" required className={selectClassName} disabled={isPending}>
            <option value="" disabled>Select a member</option>
            {assignableMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}{member.job_title ? ` — ${member.job_title}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={isPending} className="w-full md:w-auto">
            {isPending ? "Adding…" : "Add member"}
          </Button>
        </div>
      </div>
      {state.formError ? <p role="alert" className="text-sm text-red-700">{state.formError}</p> : null}
    </form>
  );
}
