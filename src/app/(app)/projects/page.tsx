import Link from "next/link";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectListControls } from "@/components/projects/project-list-controls";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getAccessibleProjectsWithTasks } from "@/data/queries/project-progress";
import { filterAndSortProjects, getPresentedProjects, getProjectListEmptyState, getProjectListFilters, hasActiveProjectListFilters } from "@/lib/project-list-presentation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Projects | StudioFlow" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("Projects");
  const [profile, params] = await Promise.all([getCurrentUserProfile(), searchParams]);
  if (!profile) return <div className="space-y-6"><PageHeader title="Projects" description="Please log in to view projects." /><EmptyState compact title="You must be logged in to view projects." /></div>;

  const [result, membership] = await Promise.all([
    getAccessibleProjectsWithTasks(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
  ]);
  const filters = getProjectListFilters(params);
  const projects = result.projects ? filterAndSortProjects(getPresentedProjects(result.projects), filters) : [];
  const emptyState = getProjectListEmptyState(filters);

  return <div className="space-y-6">
    <PageHeader title={t("title")} description={t("description")} action={membership?.system_role === "admin" ? <Button asChild><Link href="/projects/new">{t("newProject")}</Link></Button> : undefined} />
    {result.error ? <EmptyState compact title="Projects could not be loaded." description="Please try again later." className="border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)]" /> : result.projects.length === 0 ? <EmptyState compact title="No projects are available in your access scope yet." /> : <>
      <ProjectListControls filters={filters} />
      {projects.length ? <ProjectList projects={projects} /> : <EmptyState compact title={emptyState.title} description="Adjust or reset the filters to see your accessible projects." action={emptyState.canReset ? <Button asChild variant="outline"><Link href="/projects">Reset filters</Link></Button> : undefined} />}
      {hasActiveProjectListFilters(filters) ? <p className="text-sm text-[var(--ui-text-muted)]">Showing {projects.length} of {result.projects.length} accessible projects.</p> : null}
    </>}
  </div>;
}
