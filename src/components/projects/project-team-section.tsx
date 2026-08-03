import { AddProjectMemberForm } from "@/components/projects/add-project-member-form";
import { RemoveProjectMemberButton } from "@/components/projects/remove-project-member-button";
import { getTranslations } from "next-intl/server";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import type {
  AssignableStudioMember,
  ProjectMemberWithProfile,
} from "@/data/queries/project-members";

function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export async function ProjectTeamSection({
  assignableMembers,
  canManage,
  members,
  projectId,
}: {
  assignableMembers: AssignableStudioMember[];
  canManage: boolean;
  members: ProjectMemberWithProfile[];
  projectId: string;
}) {
  const [t, roles] = await Promise.all([
    getTranslations("ProjectWorkspace"),
    getTranslations("Roles"),
  ]);
  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("projectTeam")}</h2>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("teamDescription")}</p>
      </div>

      {canManage ? (
        <div className="mt-5 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4">
          <h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("addMember")}</h3>
          <div className="mt-3">
            <AddProjectMemberForm assignableMembers={assignableMembers} projectId={projectId} />
          </div>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--ui-border)] p-5 text-center">
          <p className="text-sm text-[var(--ui-text-muted)]">{t("noMembers")}</p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-[var(--ui-border-subtle)]">
          {members.map((member) => (
            <div key={member.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-action-primary)] text-sm font-semibold text-[var(--ui-action-primary-text)]" aria-hidden="true">
                  {getInitials(member.profile.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--ui-text)]">{member.profile.full_name}</p>
                  {member.profile.job_title ? <p className="truncate text-sm text-[var(--ui-text-muted)]">{(() => { const roleKey = getCanonicalRoleTranslationKey(member.profile.job_title); return roleKey ? roles(roleKey) : member.profile.job_title; })()}</p> : null}
                </div>
              </div>
              {canManage ? (
                <RemoveProjectMemberButton
                  assignmentId={member.id}
                  memberName={member.profile.full_name}
                  projectId={projectId}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
