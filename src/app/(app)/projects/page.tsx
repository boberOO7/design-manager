import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { ProjectsNavigationBoundary } from "@/components/projects/projects-navigation-boundary";
import { Plus } from "lucide-react";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { ProjectListBlueprint, ProjectsBlueprint } from "@/components/projects/projects-blueprint";
import Link from "next/link";
import { ProjectCreationModal } from "@/components/projects/project-creation-modal";
import { ProjectListToolbar, ProjectListResults } from "@/components/projects/project-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getActiveStudioAssignees } from "@/data/queries/project-members";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getAccessibleProjectsWithTasks } from "@/data/queries/project-progress";
import { getProjectsNavigationScope } from "@/data/queries/projects-navigation";
import { PROJECTS_PREFETCH_HEADER } from "@/lib/projects-prefetch-request";
import { getPresentedProjects } from "@/lib/project-list-presentation";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

export default async function ProjectsPage() {
  const requestHeaders = await headers();
  const prefetched = requestHeaders.get(PROJECTS_PREFETCH_HEADER) === "1";
  // Late-starting reads miss the initial flush and incur React's Suspense reveal throttle.
  const projects = getAccessibleProjectsWithTasks({ refreshSchedules: !prefetched });
  const creation = getActiveStudioMembership().then(membership => membership?.system_role === "admin" ? CreationAction() : null);
  // The streamed consumers own failures even when page context exits early.
  void projects.catch(() => {});
  void creation.catch(() => {});
  const [t, profile, membership, scope] = await Promise.all([getTranslations("Projects"), getCurrentUserProfile(), getActiveStudioMembership(), getProjectsNavigationScope()]);
  if (!profile) return <div className="space-y-6"><PageHeader title={t("title")} description={t("loginDescription")} /><EmptyState title={t("loginRequired")} /></div>;
  return <ProjectsNavigationBoundary snapshot={{ scope, prefetched, renderId: randomUUID() }} fallback={<ProjectsBlueprint />}><div className="space-y-6">
    <PageHeader title={t("title")} description={t("description")} action={membership?.system_role === "admin" ? <Button asChild variant="ghost"><Link href="/projects/templates">{t("projectTemplates")}</Link></Button> : undefined} />
    <ProjectListToolbar action={membership?.system_role === "admin" ? <Suspense fallback={<Button disabled className="min-h-11 gap-1.5" aria-busy="true"><Plus className="size-4" aria-hidden="true" />{t("newProject")}</Button>}>{creation}</Suspense> : undefined} />
    <Suspense fallback={<ProjectListBlueprint />}><ProjectsStream pending={projects} /></Suspense>
  </div></ProjectsNavigationBoundary>;
}

async function CreationAction() {
  const [templates, members] = await Promise.all([getStudioProjectTemplates(), getActiveStudioAssignees()]);
  return <ProjectCreationModal defaultStartDate={getKyivDateOnly()} members={members} templates={templates} />;
}

async function ProjectsStream({ pending }: { pending: ReturnType<typeof getAccessibleProjectsWithTasks> }) {
  const result = await pending;
  return <InstaLoadReady name="projects" className="instaload-panel projects-list-motion space-y-6"><ProjectListResults loadError={Boolean(result.error)} projects={getPresentedProjects(result.projects ?? []).map(({ id, name, client_name, status, priority, due_date, participants, progress, health, healthReason }) => ({ id, name, client_name, status, priority, due_date, participants, progress, health, healthReason }))} /></InstaLoadReady>;
}
