import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getAccessibleProjectsWithTasks } from "@/data/queries/project-progress";
import { calculateProjectProgress, getProjectHealth, getProjectHealthLabel } from "@/lib/project-progress";
import { formatDateOnly } from "@/lib/utils";
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
    getAccessibleProjectsWithTasks(),
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
          {result.projects.map((project) => {
            const progress = calculateProjectProgress(project.tasks);
            const health = getProjectHealth({ projectStatus: project.status, projectDueDate: project.due_date, progress });
            const healthClassName = health.health === "overdue" ? "bg-red-100 text-red-800" : health.health === "needs_attention" || health.health === "deadline_soon" ? "bg-amber-100 text-amber-800" : health.health === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700";
            return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{project.name}</p>
                  <p className="text-sm text-stone-500">{project.project_code}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthClassName}`}>{getProjectHealthLabel(health.health)}</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">{project.status}</span></div>
              </div>
              {project.description ? <p className="mt-3 line-clamp-2 text-sm text-stone-600">{project.description}</p> : null}
              {progress.progressPercent === null ? <p className="mt-4 text-sm font-medium text-stone-500">No tasks yet</p> : <><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`${project.name} progress: ${progress.progressPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="h-full rounded-full bg-stone-900" style={{ width: `${progress.progressPercent}%` }} /></div><span className="text-sm font-semibold text-stone-800">{progress.progressPercent}%</span></div><p className="mt-3 text-sm text-stone-600">{progress.completedTaskCount} completed · {progress.openTaskCount} open{progress.overdueTaskCount > 0 ? ` · ${progress.overdueTaskCount} overdue` : ""}</p></>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500"><span>{project.due_date ? `Project deadline ${formatDateOnly(project.due_date)}` : "No project deadline"}</span>{progress.nearestOpenTaskDueDate ? <span>Next task {formatDateOnly(progress.nearestOpenTaskDueDate)}</span> : null}</div>
            </Link>
          ); })}
        </div>
      )}
    </div>
  );
}
