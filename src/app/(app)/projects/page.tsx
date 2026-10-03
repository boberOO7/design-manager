import Link from "next/link";
import { ProjectCreationModal } from "@/components/projects/project-creation-modal";
import { ProjectListWorkspace } from "@/components/projects/project-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getActiveStudioAssignees } from "@/data/queries/project-members";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getAccessibleProjectsWithTasks } from "@/data/queries/project-progress";
import { getPresentedProjects } from "@/lib/project-list-presentation";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

export default async function ProjectsPage() {
  const t = await getTranslations("Projects");
  const profile = await getCurrentUserProfile();
  if (!profile) return <div className="space-y-6"><PageHeader title={t("title")} description={t("loginDescription")} /><EmptyState title={t("loginRequired")} /></div>;

  const [result, membership, templates, members] = await Promise.all([
    getAccessibleProjectsWithTasks(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
    profile.is_active ? getStudioProjectTemplates() : Promise.resolve([]),
    profile.is_active ? getActiveStudioAssignees() : Promise.resolve([]),
  ]);

  return <div className="space-y-6">
    <PageHeader title={t("title")} description={t("description")} action={membership?.system_role === "admin" ? <Button asChild variant="ghost"><Link href="/projects/templates">{t("projectTemplates")}</Link></Button> : undefined} />
    <ProjectListWorkspace action={membership?.system_role === "admin" ? <ProjectCreationModal defaultStartDate={getKyivDateOnly()} members={members} templates={templates} /> : undefined} loadError={Boolean(result.error)} projects={getPresentedProjects(result.projects ?? []).map(({ id, name, client_name, status, priority, due_date, participants, progress, health, healthReason }) => ({ id, name, client_name, status, priority, due_date, participants, progress, health, healthReason }))} />
  </div>;
}
