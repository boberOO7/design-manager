import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { ProjectsNavigationBoundary } from "@/components/projects/projects-navigation-boundary";
import { LayoutTemplate, Plus } from "lucide-react";
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
import { getStudioDirectionPresets } from "@/data/queries/work-direction-presets";
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
    <PageHeader title={t("title")} description={t("description")} />
    <ProjectListToolbar action={membership?.system_role === "admin" ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="ghost" className="min-h-11 gap-2 px-4 duration-200 motion-reduce:transition-none">
          <Link href="/projects/templates">
            <LayoutTemplate className="size-4 shrink-0" aria-hidden="true" />
            {t("projectTemplates")}
          </Link>
        </Button>
        <Suspense fallback={<Button disabled className="min-h-11 gap-2 px-4 duration-200 motion-reduce:transition-none" aria-busy="true"><Plus className="size-4" aria-hidden="true" />{t("newProject")}</Button>}>{creation}</Suspense>
      </div>
    ) : undefined} />
    <Suspense fallback={<ProjectListBlueprint />}><ProjectsStream pending={projects} /></Suspense>
  </div></ProjectsNavigationBoundary>;
}

async function CreationAction() {
  const [templates, members, presets] = await Promise.all([getStudioProjectTemplates(), getActiveStudioAssignees(), getStudioDirectionPresets()]);
  return <ProjectCreationModal defaultStartDate={getKyivDateOnly()} members={members} templates={templates} presets={presets} />;
}

async function ProjectsStream({ pending }: { pending: ReturnType<typeof getAccessibleProjectsWithTasks> }) {
  const result = await pending;
  return <InstaLoadReady name="projects" className="instaload-panel projects-list-motion space-y-6"><ProjectListResults loadError={Boolean(result.error)} projects={getPresentedProjects(result.projects ?? []).map(({ id, name, client_name, status, priority, due_date, participants, directions, progress, health, healthReason }) => ({ id, name, client_name, status, priority, due_date, participants, directions, progress, health, healthReason }))} /></InstaLoadReady>;
}
