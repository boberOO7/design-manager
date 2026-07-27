import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getProjectById } from "@/data/queries/project-by-id";
import { formatDate } from "@/lib/utils";
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
  const project = await getProjectById(projectId);

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
          <p className="text-sm text-stone-500">Priority</p>
          <p className="mt-2 font-semibold text-stone-900">{project.priority}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Project details</h2>
        <dl className="mt-4 grid gap-5 text-sm md:grid-cols-2">
          {project.project_code ? (
            <div>
              <dt className="text-stone-500">Project code</dt>
              <dd className="mt-1 font-medium text-stone-900">{project.project_code}</dd>
            </div>
          ) : null}
          {project.client_name ? (
            <div>
              <dt className="text-stone-500">Client</dt>
              <dd className="mt-1 font-medium text-stone-900">{project.client_name}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-stone-500">Start date</dt>
            <dd className="mt-1 font-medium text-stone-900">{formatDate(project.start_date)}</dd>
          </div>
          {project.due_date ? (
            <div>
              <dt className="text-stone-500">Due date</dt>
              <dd className="mt-1 font-medium text-stone-900">{formatDate(project.due_date)}</dd>
            </div>
          ) : null}
          {project.completed_at ? (
            <div>
              <dt className="text-stone-500">Completion date</dt>
              <dd className="mt-1 font-medium text-stone-900">{formatDate(project.completed_at)}</dd>
            </div>
          ) : null}
          {project.archived_at ? (
            <div>
              <dt className="text-stone-500">Archive date</dt>
              <dd className="mt-1 font-medium text-stone-900">{formatDate(project.archived_at)}</dd>
            </div>
          ) : null}
          {project.description ? (
            <div className="md:col-span-2">
              <dt className="text-stone-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-stone-700">{project.description}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Progress</h2>
        <p className="mt-2 text-sm text-stone-500">Progress tracking will be available here soon.</p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Recent progress entries</h2>
        <p className="mt-2 text-sm text-stone-500">Progress entries are not connected yet.</p>
      </div>
    </div>
  );
}
