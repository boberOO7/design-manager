import Link from "next/link";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getArchivedProjects } from "@/data/queries/archived-projects";
import { formatDate } from "@/lib/utils";
import { restoreProject } from "@/app/(app)/projects/[projectId]/actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archive | StudioFlow",
};

export default async function ArchivePage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Archive" description="Please log in to view archived projects." />
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">You must be logged in to view archived projects.</p>
        </div>
      </div>
    );
  }

  const [result, membership] = await Promise.all([
    getArchivedProjects(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Archive" description="Archived projects preserved for reference." />
      {result.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-800">Archived projects could not be loaded. Please try again later.</p>
        </div>
      ) : result.projects.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">No archived projects are available in your access scope.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {result.projects.map((project) => {
            const canRestore =
              membership?.system_role === "admin" && membership.studio_id === project.studio_id;

            return (
              <div key={project.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/projects/${project.id}`} className="font-semibold text-stone-900 hover:underline">
                      {project.name}
                    </Link>
                    <p className="text-sm text-stone-500">{project.project_code || project.client_name || "Archived project"}</p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{project.status}</span>
                </div>
                {project.description ? <p className="mt-3 text-sm text-stone-600">{project.description}</p> : null}
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
                  <p className="text-sm text-stone-500">
                    Archived {project.archived_at ? formatDate(project.archived_at) : "date unavailable"}
                  </p>
                  {canRestore ? (
                    <ProjectStatusAction
                      action={restoreProject.bind(null, project.id)}
                      label="Restore"
                      pendingLabel="Restoring…"
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
