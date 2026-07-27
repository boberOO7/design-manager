import { AddProjectMemberForm } from "@/components/projects/add-project-member-form";
import { RemoveProjectMemberButton } from "@/components/projects/remove-project-member-button";
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

export function ProjectTeamSection({
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
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Project team</h2>
        <p className="mt-1 text-sm text-stone-500">People assigned to this project and their professional roles.</p>
      </div>

      {canManage ? (
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Add member</h3>
          <div className="mt-3">
            <AddProjectMemberForm assignableMembers={assignableMembers} projectId={projectId} />
          </div>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-5 text-center">
          <p className="text-sm text-stone-500">No team members are assigned to this project yet.</p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-stone-100">
          {members.map((member) => (
            <div key={member.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white" aria-hidden="true">
                  {getInitials(member.profile.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-900">{member.profile.full_name}</p>
                  {member.profile.job_title ? <p className="truncate text-sm text-stone-500">{member.profile.job_title}</p> : null}
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
