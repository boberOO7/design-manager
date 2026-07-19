import { PageHeader } from "@/components/shared/page-header";
import { getProjectsData } from "@/data/queries";
import { formatDate, getProgressPercentage } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects | StudioFlow",
};

export default function ProjectsPage() {
  const projects = getProjectsData();

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Active and archived studio work, filtered for your access scope." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
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
            <div className="mt-3 text-sm text-stone-500">Assigned: {project.assigned_employees.join(", ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
