import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectById } from "@/data/queries/project-by-id";
import { isProjectPriority } from "@/lib/validation/project";
import { updateProject } from "../actions";

export const metadata: Metadata = {
  title: "Edit Project | StudioFlow",
};

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [profile, membership, project] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
    getProjectById(projectId),
  ]);

  if (
    !profile ||
    !profile.is_active ||
    profile.system_role !== "admin" ||
    !membership ||
    membership.system_role !== "admin" ||
    membership.authenticatedUserId !== profile.id ||
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "archived" ||
    project.status === "completed" ||
    project.archived_at ||
    !isProjectPriority(project.priority)
  ) {
    notFound();
  }

  const action = updateProject.bind(null, project.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Edit project" description={`Update ${project.name}.`} />
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:p-8">
        <ProjectForm
          action={action}
          cancelHref={`/projects/${project.id}`}
          defaultValues={{
            name: project.name,
            project_code: project.project_code ?? undefined,
            client_name: project.client_name ?? undefined,
            description: project.description ?? undefined,
            total_area_m2: project.total_area_m2,
            priority: project.priority,
            start_date: project.start_date,
            due_date: project.due_date ?? undefined,
          }}
          mode="edit"
        />
      </div>
    </div>
  );
}
