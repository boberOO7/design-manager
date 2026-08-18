import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectContextBand } from "@/components/projects/project-context-band";
import { ProjectActivitySection } from "@/components/projects/project-activity-section";
import { ProjectLifecycleProvider } from "@/components/projects/project-lifecycle-context";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectActivity } from "@/data/queries/project-activity";
import { getAssignableProjectMembers, getAssignableStudioMembers, getProjectMembers } from "@/data/queries/project-members";
import { getProjectTasks } from "@/data/queries/tasks";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { getProjectStageColumns } from "@/data/queries/project-stage-columns";
import { getLocalizedCityName } from "@/lib/city-provider";
import { isAppLocale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { isProjectTypeKey } from "@/lib/validation/project";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { archiveProject, restoreProject, updateProject } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProjectWorkspace");
  return { title: t("board") };
}

type ProjectView = "board" | "details" | "team" | "activity";

function getProjectView(value: string | string[] | undefined): ProjectView {
  return value === "details" || value === "team" || value === "activity" ? value : "board";
}

export default async function ProjectDetailsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string | string[]; task?: string | string[] }> }) {
  const [{ projectId }, query, t, locale] = await Promise.all([params, searchParams, getTranslations("ProjectWorkspace"), getLocale()]);
  const view = getProjectView(query.view);
  const initialTaskId = typeof query.task === "string" ? query.task : undefined;
  const [project, adminMembership, profile] = await Promise.all([getProjectById(projectId), getActiveStudioAdmin(), getCurrentUserProfile()]);
  if (!project || !profile) notFound();
  const localizedProject = {
    ...project,
    city: await getLocalizedCityName({ city: project.city, geonamesId: project.city_geonames_id, locale: isAppLocale(locale) ? locale : "en" }),
  };

  const isArchived = project.status === "archived" || project.archived_at !== null;
  const canManage = adminMembership?.studio_id === project.studio_id;
  const [tasks, taskAssignees, projectMembers, activity, templates, stageColumns] = await Promise.all([
    getProjectTasks(project.id),
    view === "board" && canManage ? getAssignableProjectMembers(project.id, project.studio_id) : Promise.resolve([]),
    view === "team" ? getProjectMembers(project.id) : Promise.resolve([]),
    view === "activity" ? getProjectActivity(project.id) : Promise.resolve([]),
    view === "board" && canManage ? getStudioChecklistTemplates() : Promise.resolve([]),
    view === "board" ? getProjectStageColumns(project.id) : Promise.resolve(null),
  ]);
  const assignableStudioMembers = view === "team" && canManage ? await getAssignableStudioMembers(project, projectMembers.map((member) => member.user_id)) : [];
  const archiveAction = archiveProject.bind(null, project.id);
  const restoreAction = restoreProject.bind(null, project.id);
  const updateAction = updateProject.bind(null, project.id);
  const navItems: Array<{ id: ProjectView; label: string }> = [{ id: "board", label: t("board") }, { id: "details", label: t("details") }, { id: "team", label: t("team") }, { id: "activity", label: t("activity") }];
  const navigation = <nav aria-label={t("navigation")} className="flex max-w-full gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]">{navItems.map((item) => <Link key={item.id} href={item.id === "board" ? `/projects/${project.id}` : `/projects/${project.id}?view=${item.id}`} aria-current={view === item.id ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${view === item.id ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]"}`}>{item.label}</Link>)}</nav>;

  return <ProjectLifecycleProvider initialStatus={project.status}><div className="space-y-3">{view === "board" && stageColumns ? <ProjectWorkspace archiveAction={archiveAction} canCreate={canManage && !isArchived} canManage={canManage} canManageTasks={canManage} currentUserId={profile.id} initialTaskId={initialTaskId} isArchived={isArchived} isProjectReadOnly={isArchived} members={taskAssignees} navigation={navigation} project={localizedProject} restoreAction={restoreAction} stageColumns={stageColumns} tasks={tasks} templates={templates} updateAction={updateAction} /> : <><ProjectContextBand archiveAction={archiveAction} canManage={canManage} currentUserId={profile.id} isArchived={isArchived} project={localizedProject} restoreAction={restoreAction} tasks={tasks} updateAction={updateAction} />{navigation}{view === "details" ? <ProjectDetails locale={locale} project={localizedProject} /> : view === "team" ? <ProjectTeamSection assignableMembers={assignableStudioMembers} canManage={canManage} members={projectMembers} projectId={project.id} /> : <ProjectActivitySection activity={activity} projectId={project.id} />}</>}</div></ProjectLifecycleProvider>;
}

async function ProjectDetails({ locale, project }: { locale: string; project: NonNullable<Awaited<ReturnType<typeof getProjectById>>> }) {
  const [t, form, projectTypes] = await Promise.all([getTranslations("ProjectWorkspace"), getTranslations("ProjectForm"), getTranslations("ProjectTypes")]);
  const typeLabel = project.project_type ? (isProjectTypeKey(project.project_type) ? projectTypes(project.project_type) : project.project_type) : null;
  const items = [
    { label: form("projectCode"), value: project.project_code },
    { label: form("projectType"), value: typeLabel },
    { label: form("clientName"), value: project.client_name },
    { label: form("country"), value: getCountryName(project.country_code, locale) },
    { label: form("city"), value: project.city },
    { label: form("totalArea"), value: `${formatNumber(project.total_area_m2, locale)} m²` },
    { label: t("plannedStartDate"), value: formatDate(project.start_date, locale) },
    { label: form("dueDate"), value: project.due_date ? formatDate(project.due_date, locale) : null },
  ];
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)]"><h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("projectDetails")}</h2><dl className="mt-4 grid gap-5 text-sm md:grid-cols-2">{items.map((item) => <div key={item.label}><dt className="text-[var(--ui-text-muted)]">{item.label}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{item.value ?? t("notAvailable")}</dd></div>)}{project.completed_at ? <div><dt className="text-[var(--ui-text-muted)]">{t("completionDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.completed_at, locale)}</dd></div> : null}{project.archived_at ? <div><dt className="text-[var(--ui-text-muted)]">{t("archiveDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.archived_at, locale)}</dd></div> : null}{project.description ? <div className="md:col-span-2"><dt className="text-[var(--ui-text-muted)]">{t("description")}</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{project.description}</dd></div> : null}</dl></section>;
}
