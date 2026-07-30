import { InviteEmployeeForm } from "@/components/team/invite-employee-form";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCurrentStudioTeam } from "@/data/queries/team";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team | StudioFlow",
};

function getInitials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function TeamPage() {
  const [teamMembers, adminMembership] = await Promise.all([
    getCurrentStudioTeam(),
    getActiveStudioAdmin(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Active studio members and their professional roles."
      />

      {adminMembership ? <InviteEmployeeForm /> : null}

      <section aria-labelledby="team-directory-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="team-directory-heading" className="text-lg font-semibold text-stone-900">
            Studio directory
          </h2>
          <p className="text-sm text-stone-500">
            {teamMembers.length} active {teamMembers.length === 1 ? "member" : "members"}
          </p>
        </div>

        {teamMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
            <p className="font-medium text-stone-800">No active team members</p>
            <p className="mt-1 text-sm text-stone-500">
              Active studio members will appear here once they are added.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teamMembers.map((member) => (
              <article key={member.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  {member.avatar_url ? (
                    <span
                      aria-label={`${member.full_name} avatar`}
                      role="img"
                      className="h-12 w-12 shrink-0 rounded-full bg-stone-200 bg-cover bg-center"
                      style={{ backgroundImage: `url(${member.avatar_url})` }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white"
                    >
                      {getInitials(member.full_name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-stone-900">{member.full_name}</p>
                    {member.job_title ? (
                      <p className="mt-1 truncate text-sm text-stone-500">{member.job_title}</p>
                    ) : (
                      <p className="mt-1 text-sm text-stone-400">Job title not provided</p>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                    {member.system_role === "admin" ? "Admin" : "Employee"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {member.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
