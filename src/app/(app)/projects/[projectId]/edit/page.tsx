import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectById } from "@/data/queries/project-by-id";
import { isProjectPriority } from "@/lib/validation/project";
import { getTranslations } from "next-intl/server";
import { updateProject } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("editProjectMetadata") };
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [profile, membership, project, t] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
    getProjectById(projectId),
    getTranslations("Projects"),
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
      <PageHeader title={t("editProject")} description={t("editProjectDescription", { projectName: project.name })} />
      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 shadow-sm lg:p-8">
        <ProjectForm
          action={action}
          cancelHref={`/projects/${project.id}`}
          defaultValues={{
            name: project.name,
            project_type: project.project_type ?? undefined,
            country_code: project.country_code,
            city: project.city ?? undefined,
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
