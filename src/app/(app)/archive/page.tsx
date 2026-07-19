import { PageHeader } from "@/components/shared/page-header";
import { getProjectsData } from "@/data/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archive | StudioFlow",
};

export default function ArchivePage() {
  const projects = getProjectsData().filter((project) => project.status === "archived" || project.status === "completed");

  return (
    <div className="space-y-6">
      <PageHeader title="Archive" description="Completed and archived projects preserved for reference." />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <div key={project.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-stone-900">{project.name}</p>
                <p className="text-sm text-stone-500">{project.project_code}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{project.status}</span>
            </div>
            <p className="mt-3 text-sm text-stone-600">{project.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
