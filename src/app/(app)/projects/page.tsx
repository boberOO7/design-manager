import Link from "next/link";
import { ProjectCreationModal } from "@/components/projects/project-creation-modal";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectListControls } from "@/components/projects/project-list-controls";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getActiveStudioAssignees } from "@/data/queries/project-members";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getAccessibleProjectsWithTasks } from "@/data/queries/project-progress";
import { filterAndSortProjects, getPresentedProjects, getProjectListEmptyState, getProjectListFilters, hasActiveProjectListFilters } from "@/lib/project-list-presentation";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("Projects");
  const [profile, params] = await Promise.all([getCurrentUserProfile(), searchParams]);
  if (!profile) return <div className="space-y-6"><PageHeader title={t("title")} description={t("loginDescription")} /><EmptyState title={t("loginRequired")} /></div>;

  const [result, membership, templates, members] = await Promise.all([
    getAccessibleProjectsWithTasks(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
    profile.is_active ? getStudioProjectTemplates() : Promise.resolve([]),
    profile.is_active ? getActiveStudioAssignees() : Promise.resolve([]),
  ]);
  const filters = getProjectListFilters(params);
  const projects = result.projects ? filterAndSortProjects(getPresentedProjects(result.projects), filters) : [];
  const emptyState = getProjectListEmptyState(filters);

  return <div className="space-y-6">
    <PageHeader title={t("title")} description={t("description")} action={membership?.system_role === "admin" ? <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/projects/templates">Шаблони проєктів</Link></Button><ProjectCreationModal defaultStartDate={getKyivDateOnly()} members={members} templates={templates} /></div> : undefined} />
    {result.error ? <EmptyState title={t("loadTitle")} description={t("loadDescription")} className="border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)]" /> : result.projects.length === 0 ? <EmptyState title={t("empty")} description={t("emptyDescription")} /> : <>
      <ProjectListControls filters={filters} />
      {projects.length ? <ProjectList projects={projects} /> : <EmptyState title={t(emptyState.titleKey)} description={t("emptyFilteredDescription")} action={emptyState.canReset ? <Button asChild variant="outline"><Link href="/projects">{t("resetFilters")}</Link></Button> : undefined} />}
      {hasActiveProjectListFilters(filters) ? <p className="text-sm text-[var(--ui-text-muted)]">Showing {projects.length} of {result.projects.length} accessible projects.</p> : null}
    </>}
  </div>;
}
