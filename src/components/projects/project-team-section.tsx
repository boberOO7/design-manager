import { AddProjectMemberForm } from "@/components/projects/add-project-member-form";
import { RemoveProjectMemberButton } from "@/components/projects/remove-project-member-button";
import { getTranslations } from "next-intl/server";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { UserAvatar } from "@/components/ui/user-avatar";
import type {
  AssignableStudioMember,
  ProjectMemberWithProfile,
} from "@/data/queries/project-members";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("projectTeam")}</h2>
          <p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("teamDescription")}</p>
        </div>
        {canManage ? <AddProjectMemberForm assignableMembers={assignableMembers} projectId={projectId} /> : null}
      </div>

      {members.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--ui-border)] p-5 text-center">
          <p className="text-sm text-[var(--ui-text-muted)]">{t("noMembers")}</p>
        </div>
      ) : (
        <div className="mt-5">
          {members.map((member) => (
            <div key={member.id} className="group relative -mx-3 flex flex-col gap-4 rounded-lg px-3 py-4 transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--ui-border-subtle)] after:content-[''] last:after:hidden hover:bg-[var(--ui-surface-muted)] focus-within:bg-[var(--ui-surface-muted)] md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar imageUrl={member.profile.avatar_url} name={member.profile.full_name} size="md" decorative />
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
                  userId={member.profile.id}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
