import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  getAccessibleProjectsFromSupabase,
  getCurrentUserProfile,
} from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { formatDate, getProgressPercentage } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Projects | StudioFlow",
};

export default async function ProjectsPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Projects" description="Please log in to view projects." />
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">You must be logged in to view projects.</p>
        </div>
      </div>
    );
  }

  const [result, membership] = await Promise.all([
    getAccessibleProjectsFromSupabase(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Current studio work, filtered for your access scope."
        action={
          membership?.system_role === "admin" ? (
            <Button asChild>
              <Link href="/projects/new">New project</Link>
            </Button>
          ) : undefined
        }
      />
      {result.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-800">Projects could not be loaded. Please try again later.</p>
        </div>
      ) : result.projects.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">No projects are available in your access scope yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.projects.map((project) => (
            <div key={project.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{project.name}</p>
                  <p className="text-sm text-stone-500">{project.project_code}</p>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{project.status}</span>
              </div>
              <p className="mt-3 text-sm text-stone-600">{project.description}</p>
              <div className="mt-4 h-2 rounded-full bg-stone-100">
                <div className="h-2 rounded-full bg-stone-900" style={{ width: `${getProgressPercentage(project.total_area_m2, project.completed_area_m2)}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
                <span>{project.completed_area_m2}/{project.total_area_m2} m²</span>
                <span>{formatDate(project.due_date)}</span>
              </div>
              <div className="mt-3 text-sm text-stone-500">Assigned: {project.assigned_employees.join(", ") || "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
