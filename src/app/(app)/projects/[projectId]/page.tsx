import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getProjectData, getProjectProgressData } from "@/data/queries";
import { formatDate, getProgressPercentage } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Details | StudioFlow",
};

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProjectData(projectId);
  const progressEntries = getProjectProgressData(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={project.name} description={project.client_name ?? "Interior design project overview"} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">Status</p>
          <p className="mt-2 font-semibold text-stone-900">{project.status}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">Total area</p>
          <p className="mt-2 font-semibold text-stone-900">{project.total_area_m2} m²</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">Deadline</p>
          <p className="mt-2 font-semibold text-stone-900">{formatDate(project.due_date)}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Progress</h2>
            <p className="text-sm text-stone-500">Completed square meters and tracked delivery milestones.</p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700">{getProgressPercentage(project.total_area_m2, project.completed_area_m2)}%</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-stone-100">
          <div className="h-2 rounded-full bg-stone-900" style={{ width: `${getProgressPercentage(project.total_area_m2, project.completed_area_m2)}%` }} />
        </div>
        <div className="mt-4 text-sm text-stone-600">Completed area: {project.completed_area_m2} m²</div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Recent progress entries</h2>
        <div className="mt-4 space-y-3">
          {progressEntries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-stone-900">{entry.area_m2} m² completed</p>
                <p className="text-sm text-stone-500">{formatDate(entry.progress_date)}</p>
              </div>
              {entry.note ? <p className="mt-1 text-sm text-stone-500">{entry.note}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
