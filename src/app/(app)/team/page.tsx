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
          <h2 id="team-directory-heading" className="text-lg font-semibold text-[var(--ui-text)]">
            Studio directory
          </h2>
          <p className="text-sm text-[var(--ui-text-muted)]">
            {teamMembers.length} active {teamMembers.length === 1 ? "member" : "members"}
          </p>
        </div>

        {teamMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-8 text-center">
            <p className="font-medium text-[var(--ui-text)]">No active team members</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
              Active studio members will appear here once they are added.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teamMembers.map((member) => (
              <article key={member.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  {member.avatar_url ? (
                    <span
                      aria-label={`${member.full_name} avatar`}
                      role="img"
                      className="h-12 w-12 shrink-0 rounded-full bg-[var(--ui-surface-strong)] bg-cover bg-center"
                      style={{ backgroundImage: `url(${member.avatar_url})` }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ui-action-primary)] text-sm font-semibold text-[var(--ui-action-primary-text)]"
                    >
                      {getInitials(member.full_name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--ui-text)]">{member.full_name}</p>
                    {member.job_title ? (
                      <p className="mt-1 truncate text-sm text-[var(--ui-text-muted)]">{member.job_title}</p>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--ui-text-subtle)]">Job title not provided</p>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-[var(--ui-border-subtle)] pt-4">
                  <span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text-secondary)]">
                    {member.system_role === "admin" ? "Admin" : "Employee"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-success-text)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-success-surface)]0" />
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
