import { Suspense, type ComponentProps, type ReactNode } from "react";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { ProjectContextBlueprint, ProjectSectionBlueprint } from "@/components/projects/project-detail-blueprint";
import Link from "next/link";
import { ProjectFinanceSection } from "@/components/finance/project-finance-section";
import { DomainMessages } from "@/i18n/domain-messages";
import { notFound } from "next/navigation";
import { ProjectContextBand } from "@/components/projects/project-context-band";
import { ProjectActualStartDateForm } from "@/components/projects/project-actual-start-date-form";
import { ProjectCompletionDateForm } from "@/components/projects/project-completion-date-form";
import { ProjectActivitySection } from "@/components/projects/project-activity-section";
import { ProjectLifecycleProvider } from "@/components/projects/project-lifecycle-context";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectWorkspace, ProjectWorkspaceContext, ProjectWorkspaceBoard } from "@/components/projects/project-workspace";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectCalendarTime } from "@/data/queries/project-calendar-time";
import { getProjectActivity } from "@/data/queries/project-activity";
import { getAssignableProjectMembers, getAssignableStudioMembers, getProjectMembers } from "@/data/queries/project-members";
import { getProjectTasksForProgress } from "@/data/queries/project-progress";
import { getProjectTasks } from "@/data/queries/tasks";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { getLocalizedCityName } from "@/lib/city-provider";
import { isAppLocale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { getProjectTypeDisplayName } from "@/lib/validation/project";
import { getProjectListFilters, getProjectListHref, type ProjectListFilters } from "@/lib/project-list-presentation";
import { calculateProjectSummary } from "@/lib/project-progress";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { archiveProject, restoreProject, updateProject, updateProjectCompletionDate, updateProjectActualStartDate } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProjectWorkspace");
  return { title: t("board") };
}

type ProjectView = "board" | "details" | "team" | "activity" | "finance";

function getProjectView(value: string | string[] | undefined): ProjectView {
  return value === "details" || value === "team" || value === "activity" || value === "finance" ? value : "board";
}

function getProjectViewHref(projectId: string, view: ProjectView, filters: ProjectListFilters): string {
  const listHref = getProjectListHref(filters);
  const params = new URLSearchParams(listHref.includes("?") ? listHref.split("?")[1] : "");
  if (view !== "board") params.set("view", view);
  return `/projects/${projectId}${params.size ? `?${params}` : ""}`;
}

type ProjectPageSearchParams = Partial<Record<"view" | "task" | "lifecycle" | "health" | "priority" | "sort" | "direction" | "stream" | "page" | "credits" | "filter" | "profitFrom" | "profitTo" | "financeTab" | "profitPeriod" | "item", string | string[]>>;

export default async function ProjectDetailsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<ProjectPageSearchParams> }) {
  const [{ projectId }, query, t, locale, common] = await Promise.all([params, searchParams, getTranslations("ProjectWorkspace"), getLocale(), getTranslations("Common")]);
  const view = getProjectView(query.view);
  const initialTaskId = typeof query.task === "string" ? query.task : undefined;
  const listFilters = getProjectListFilters(query);
  const projectsHref = getProjectListHref(listFilters);
  const [project, adminMembership, profile] = await Promise.all([getProjectById(projectId), getActiveStudioAdmin(), getCurrentUserProfile()]);
  if (!project || !profile) notFound();
  const isArchived = project.status === "archived" || project.archived_at !== null;
  const canManage = adminMembership?.studio_id === project.studio_id;
  if (view === "finance" && !canManage) notFound();

  // Start authorized reads before localization; only the task loader owns schedule refresh.
  const boardTasks = view === "board" ? getProjectTasks(project.id) : Promise.resolve([]);
  const tasks = view === "board" ? boardTasks : getProjectTasksForProgress(project.id);
  const configuration = getProjectStageConfiguration(project.id);
  const localizedProject = getLocalizedCityName({ city: project.city, geonamesId: project.city_geonames_id, locale: isAppLocale(locale) ? locale : "en" }).then(city => ({ ...project, city }));
  const calendarTime = getProjectCalendarTime(project.id, project.studio_id);
  const calendarTimeSummary = <Suspense fallback={<span className="instaload-blueprint inline-block h-[1.5em] w-16 align-bottom" role="status" aria-label={common("loading")}><span aria-hidden="true" className="instaload-mark h-full w-full" /></span>}><CalendarTimeStream pending={calendarTime} /></Suspense>;
  const taskAssignees = view === "board" && canManage ? getAssignableProjectMembers(project.id, project.studio_id) : Promise.resolve([]);
  const checklistTemplates = view === "board" && canManage ? getStudioChecklistTemplates({ includeArchived: true }) : Promise.resolve([]);
  const projectTemplates = view === "board" && canManage ? getStudioProjectTemplates() : Promise.resolve([]);
  const projectMembers = view === "team" ? getProjectMembers(project.id) : Promise.resolve([]);
  const assignableStudioMembers = view === "team" && canManage ? projectMembers.then(members => getAssignableStudioMembers(project, members.map(member => member.user_id))) : Promise.resolve([]);
  const activity = view === "activity" ? getProjectActivity(project.id) : Promise.resolve([]);
  // Stream consumers own failures even if another boundary exits before consuming a read.
  for (const pending of [tasks, configuration, localizedProject, calendarTime, taskAssignees, checklistTemplates, projectTemplates, projectMembers, assignableStudioMembers, activity]) void pending.catch(() => {});
  const archiveAction = archiveProject.bind(null, project.id);
  const restoreAction = restoreProject.bind(null, project.id);
  const updateAction = updateProject.bind(null, project.id);
  const actualStartDateAction = updateProjectActualStartDate.bind(null, project.id);
  const completionDateAction = updateProjectCompletionDate.bind(null, project.id);
  const navItems: Array<{ id: ProjectView; label: string }> = [{ id: "board", label: t("board") }, { id: "details", label: t("details") }, { id: "team", label: t("team") }, { id: "activity", label: t("activity") }];
  if (canManage) navItems.push({ id: "finance", label: t("finance") });
  const navigation = <nav aria-label={t("navigation")} className="flex max-w-full gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]">{navItems.map((item) => <Link prefetch={false} key={item.id} href={getProjectViewHref(project.id, item.id, listFilters)} aria-current={view === item.id ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${view === item.id ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]"}`}>{item.label}</Link>)}</nav>;

  if (view === "board") {
    // Share one task/configuration result between context and board, keeping their state together.
    const core = Promise.all([boardTasks, configuration]).then(([tasks, configuration]) => ({ tasks, configuration }));
    const context = Promise.all([core, localizedProject]).then(([data, project]) => ({ ...data, project }));
    const board = Promise.all([core, taskAssignees, checklistTemplates, projectTemplates]).then(([data, members, templates, projectTemplates]) => ({ ...data, members, templates, projectTemplates }));
    void context.catch(() => {});
    void board.catch(() => {});
    const workspaceProps = { archiveAction, backHref: projectsHref, calendarTimeSummary, canCreate: canManage && !isArchived, canManage, canManageTasks: canManage, currentUserId: profile.id, initialTaskId, isArchived, isProjectReadOnly: isArchived, projectId: project.id, restoreAction, updateAction };
    return <ProjectLifecycleProvider initialStatus={project.status}><div data-project-detail-shell="ready" className="space-y-3"><ProjectWorkspace navigation={navigation} contextFallback={<ProjectContextBlueprint project={project} />} context={<WorkspaceContextStream pending={context} workspaceProps={workspaceProps} />} board={<WorkspaceBoardStream pending={board} workspaceProps={workspaceProps} />} /></div></ProjectLifecycleProvider>;
  }

  const context = Promise.all([localizedProject, tasks, configuration]).then(([project, tasks, configuration]) => <ProjectContextBand archiveAction={archiveAction} backHref={projectsHref} calendarTimeSummary={calendarTimeSummary} canManage={canManage} currentUserId={profile.id} isArchived={isArchived} project={project} restoreAction={restoreAction} summary={calculateProjectSummary(tasks, undefined, configuration.progressMethods, configuration.stages)} showProgress={configuration.showProgress} stages={configuration.stages} updateAction={updateAction} />);
  const content = view === "finance" ? ProjectFinanceSection({ projectId: project.id, query })
    : view === "details" ? localizedProject.then(project => ProjectDetails({ actualStartDateAction, calendarTimeSummary, canManage, completionDateAction, locale, project }))
    : view === "team" ? Promise.all([projectMembers, assignableStudioMembers]).then(([members, assignableMembers]) => ProjectTeamSection({ assignableMembers, canManage, members, projectId: project.id }))
    : activity.then(activity => ProjectActivitySection({ activity, projectId: project.id }));
  void context.catch(() => {});
  void content.catch(() => {});
  const section = <Suspense fallback={<ProjectSectionBlueprint view={view} />}><ProjectSectionStream name={`project-${view}`} pending={content} /></Suspense>;
  return <ProjectLifecycleProvider initialStatus={project.status}><div data-project-detail-shell="ready" className="space-y-3">
    <Suspense fallback={<ProjectContextBlueprint project={project} />}><ProjectSectionStream name="project-context" pending={context} /></Suspense>
    {navigation}
    {view === "finance" ? <DomainMessages scope="finance">{section}</DomainMessages> : section}
  </div></ProjectLifecycleProvider>;
}

async function WorkspaceContextStream({ pending, workspaceProps }: { pending: Promise<ComponentProps<typeof ProjectWorkspaceContext>["data"]>; workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceContext>, "data"> }) {
  return <ProjectWorkspaceContext {...workspaceProps} data={await pending} />;
}

async function WorkspaceBoardStream({ pending, workspaceProps }: { pending: Promise<ComponentProps<typeof ProjectWorkspaceBoard>["data"]>; workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceBoard>, "data"> }) {
  return <ProjectWorkspaceBoard {...workspaceProps} data={await pending} />;
}

async function ProjectSectionStream({ name, pending }: { name: string; pending: Promise<ReactNode> }) {
  const content = await pending;
  return <InstaLoadReady name={name} className="instaload-panel"><div data-instaload-arrival={name}>{content}</div></InstaLoadReady>;
}

async function CalendarTimeStream({ pending }: { pending: ReturnType<typeof getProjectCalendarTime> }) {
  const [calendarTime, t] = await Promise.all([pending, getTranslations("ProjectWorkspace")]);
  const hours = Math.floor(calendarTime.minutes / 60);
  const minutes = calendarTime.minutes % 60;
  const duration = [hours && `${hours} ${t("hoursShort")}`, minutes && `${minutes} ${t("minutesShort")}`].filter(Boolean).join(" ") || `0 ${t("minutesShort")}`;
  return <span data-project-calendar-ready>{calendarTime.count ? `${calendarTime.count} · ${duration}` : "0"}</span>;
}

async function ProjectDetails({ actualStartDateAction, calendarTimeSummary, canManage, completionDateAction, locale, project }: { actualStartDateAction: ProjectFormAction; calendarTimeSummary: ReactNode; canManage: boolean; completionDateAction: ProjectFormAction; locale: string; project: NonNullable<Awaited<ReturnType<typeof getProjectById>>> }) {
  const [t, form, projectTypes] = await Promise.all([getTranslations("ProjectWorkspace"), getTranslations("ProjectForm"), getTranslations("ProjectTypes")]);
  const typeLabel = getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes);
  const items = [
    { label: form("projectType"), value: typeLabel },
    { label: form("clientName"), value: project.client_name },
    { label: form("country"), value: getCountryName(project.country_code, locale) },
    { label: form("city"), value: project.city },
    { label: form("totalArea"), value: `${formatNumber(project.total_area_m2, locale)} m²` },
    { label: t("siteVisits"), value: calendarTimeSummary },
  ];
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)]">
    <h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("projectDetails")}</h2>
    <dl className="mt-4 grid gap-5 text-sm md:grid-cols-2">
      {items.map((item) => <div key={item.label}><dt className="text-[var(--ui-text-muted)]">{item.label}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{item.value ?? t("notAvailable")}</dd></div>)}
      {project.archived_at ? <div><dt className="text-[var(--ui-text-muted)]">{t("archiveDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.archived_at, locale)}</dd></div> : null}
    </dl>
    <div className="mt-5 grid gap-5 border-t border-[var(--ui-border)] pt-5 md:grid-cols-2">
      <div><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("planDates")}</h3><dl className="mt-3 space-y-4 text-sm">
        <div><dt className="text-[var(--ui-text-muted)]">{t("plannedStartDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{project.start_date ? formatDate(project.start_date, locale) : t("notAvailable")}</dd></div>
        <div><dt className="text-[var(--ui-text-muted)]">{form("dueDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{project.due_date ? formatDate(project.due_date, locale) : t("notAvailable")}</dd></div>
      </dl></div>
      <div><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("factDates")}</h3><dl className="mt-3 space-y-4 text-sm">
        <div><dt className="text-[var(--ui-text-muted)]">{t("actualStartDate")}</dt><dd>{canManage ? <ProjectActualStartDateForm action={actualStartDateAction} startedAt={project.started_at} locale={locale} /> : <p className="mt-1 font-medium text-[var(--ui-text)]">{project.started_at ? formatDate(project.started_at, locale) : t("notAvailable")}</p>}</dd></div>
        <div><dt className="text-[var(--ui-text-muted)]">{t("completionDate")}</dt><dd>{project.status === "completed" && canManage ? <ProjectCompletionDateForm action={completionDateAction} completedAt={project.completed_at ?? ""} locale={locale} /> : <p className="mt-1 font-medium text-[var(--ui-text)]">{project.completed_at ? formatDate(project.completed_at, locale) : t("notAvailable")}</p>}</dd></div>
      </dl></div>
    </div>
    {project.description ? <dl className="mt-5 text-sm"><dt className="text-[var(--ui-text-muted)]">{t("description")}</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{project.description}</dd></dl> : null}
  </section>;
}
