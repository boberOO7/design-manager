import { createHash } from "node:crypto";
import { ProjectNavigationProgress } from "@/components/projects/project-navigation-progress";
import { Activity, MessageSquare, Users } from "lucide-react";
import headerStyles from "@/components/projects/project-context-band.module.css";
import { ProjectFeedback } from "@/components/feedback/project-feedback";
import { getProjectFeedback } from "@/data/queries/feedback";
import { Suspense, type ComponentProps, type ReactNode } from "react";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { ProjectContextBlueprint, ProjectSectionBlueprint } from "@/components/projects/project-detail-blueprint";
import { ProjectFinanceSection } from "@/components/finance/project-finance-section";
import { DomainMessages } from "@/i18n/domain-messages";
import { notFound } from "next/navigation";
import { ProjectWorkspaceNavigation, ProjectWorkspaceLink } from "@/components/projects/project-workspace-navigation";
import { getStudioDirectionPresets } from "@/data/queries/work-direction-presets";
import { projectWorkspaceHref, projectWorkspaceSurfaceKey, resolveProjectWorkspace, type ProjectWorkspaceView } from "@/lib/project-workspace-navigation";

import { ProjectActualStartDateForm } from "@/components/projects/project-actual-start-date-form";
import { ProjectCompletionDateForm } from "@/components/projects/project-completion-date-form";
import { ProjectActivitySection } from "@/components/projects/project-activity-section";
import { ProjectLifecycleProvider } from "@/components/projects/project-lifecycle-context";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectWorkspace, ProjectWorkspaceContext, ProjectWorkspaceBoard, ProjectWorkspaceDetails } from "@/components/projects/project-workspace";
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
import { getProjectListFilters, getProjectListHref } from "@/lib/project-list-presentation";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { archiveProject, restoreProject, updateProject, updateProjectCompletionDate, updateProjectActualStartDate } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProjectWorkspace");
  return { title: t("board") };
}

type ProjectPageSearchParams = Partial<Record<"view" | "workDirection" | "feedbackPage" | "task" | "lifecycle" | "health" | "priority" | "sort" | "direction" | "stream" | "page" | "credits" | "filter" | "profitFrom" | "profitTo" | "financeTab" | "profitPeriod" | "item", string | string[]>>;

export default async function ProjectDetailsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<ProjectPageSearchParams> }) {
  const [{ projectId }, query, t, locale, common] = await Promise.all([params, searchParams, getTranslations("ProjectWorkspace"), getLocale(), getTranslations("Common")]);
  const renderedSearch = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : value?.map(item => [key, item]) ?? []));
  renderedSearch.sort();
  const initialTaskId = typeof query.task === "string" ? query.task : undefined;
  const projectsHref = getProjectListHref(getProjectListFilters(query));
  const [project, adminMembership, profile] = await Promise.all([getProjectById(projectId), getActiveStudioAdmin(), getCurrentUserProfile()]);
  if (!project || !profile) notFound();
  const isArchived = project.status === "archived" || project.archived_at !== null;
  const canManage = adminMembership?.studio_id === project.studio_id;
  if ((query.view === "finance" || query.view === "feedback") && !canManage) notFound();
  const [configuration, progressTasks] = await Promise.all([getProjectStageConfiguration(project.id), getProjectTasksForProgress(project.id)]);
  const { view, directionId } = resolveProjectWorkspace({ view: query.view, workDirection: query.workDirection, taskId: initialTaskId, directions: configuration.directions ?? [], tasks: progressTasks, stages: configuration.stages });
  const selectedDirection = configuration.directions?.find(direction => direction.id === directionId);
  const localizedProject = getLocalizedCityName({ city: project.city, geonamesId: project.city_geonames_id, locale: isAppLocale(locale) ? locale : "en" }).then(city => ({ ...project, city }));
  const projectTemplates = canManage ? getStudioProjectTemplates() : Promise.resolve([]);
  const presets = canManage ? getStudioDirectionPresets() : Promise.resolve([]);
  const calendarTime = getProjectCalendarTime(project.id, project.studio_id);
  for (const pending of [localizedProject, projectTemplates, presets, calendarTime]) void pending.catch(() => {});
  const calendarTimeSummary = <Suspense fallback={<span className="instaload-blueprint inline-block h-[1.5em] w-16 align-bottom" role="status" aria-label={common("loading")}><span aria-hidden="true" className="instaload-mark h-full w-full" /></span>}><CalendarTimeStream pending={calendarTime} /></Suspense>;
  const href = (nextView: ProjectWorkspaceView, nextDirection: string | null = directionId) => projectWorkspaceHref(project.id, nextView, nextDirection, projectsHref);
  const projectNavigation = <nav aria-label={t("projectNavigation")} className={headerStyles.projectActions}>{([{ id: "team", label: t("team"), icon: Users }, { id: "activity", label: t("activity"), icon: Activity }, ...(canManage ? [{ id: "feedback", label: t("feedback"), icon: MessageSquare }] : [])]).map(item => <ProjectWorkspaceLink key={item.id} href={href(item.id === "team" ? "team" : item.id === "activity" ? "activity" : "feedback", null)} workspaceView={item.id === "team" ? "team" : item.id === "activity" ? "activity" : "feedback"} className={headerStyles.projectAction}><item.icon aria-hidden="true"/><span>{item.label}</span><ProjectNavigationProgress/></ProjectWorkspaceLink>)}</nav>;
  const workspaceProps = { archiveAction: archiveProject.bind(null, project.id), backHref: projectsHref, calendarTimeSummary, projectNavigation, canCreate: canManage && !isArchived, canManage, canManageTasks: canManage, currentUserId: profile.id, initialTaskId, selectedDirectionId: directionId, view, isArchived, isProjectReadOnly: isArchived, projectId: project.id, restoreAction: restoreProject.bind(null, project.id), updateAction: updateProject.bind(null, project.id) };
  const context = Promise.all([localizedProject, projectTemplates, presets]).then(([project, projectTemplates, presets]) => ({ project, projectTemplates, presets, tasks: progressTasks, configuration }));
  void context.catch(() => {});
  // Overview shares data already read for the header; retain it alongside the board.
  const overviewPending = localizedProject.then(project => ProjectDetails({ actualStartDateAction: updateProjectActualStartDate.bind(null, project.id), calendarTimeSummary, canManage, completionDateAction: updateProjectCompletionDate.bind(null, project.id), locale, project }));
  void overviewPending?.catch(() => {});
  const overview = overviewPending ? <Suspense fallback={<ProjectSectionBlueprint view="details"/>}><ProjectSectionStream name="project-overview" pending={overviewPending}/></Suspense> : undefined;
  let content: ReactNode;
  if (view === "overview") content = null;
  else if (view === "board") {
    const board = Promise.all([getProjectTasks(project.id), canManage ? getAssignableProjectMembers(project.id, project.studio_id) : Promise.resolve([]), canManage ? getStudioChecklistTemplates({ includeArchived: true }) : Promise.resolve([]), projectTemplates, presets]).then(([tasks, members, templates, projectTemplates, presets]) => ({ tasks, configuration, members, templates, projectTemplates, presets }));
    void board.catch(() => {});
    content = <WorkspaceBoardStream pending={board} workspaceProps={workspaceProps} />;
  } else {
    const feedbackPage = typeof query.feedbackPage === "string" && /^[1-9]\d{0,5}$/.test(query.feedbackPage) ? Number(query.feedbackPage) : 1;
    const pending = view === "feedback" ? getProjectFeedback(project.id, feedbackPage).then(data => <DomainMessages scope="feedback"><ProjectFeedback projectId={project.id} page={feedbackPage} {...data} /></DomainMessages>)
      : view === "finance" ? ProjectFinanceSection({ projectId: project.id, query, directionId, projectHref: href("finance", null) })
      : view === "details" && selectedDirection ? Promise.all([projectTemplates, presets]).then(([templates, presets]) => <ProjectWorkspaceDetails {...workspaceProps} data={{ configuration, tasks: progressTasks, projectTemplates: templates, presets }}/>)
      : view === "team" ? getProjectMembers(project.id).then(async members => ProjectTeamSection({ assignableMembers: canManage ? await getAssignableStudioMembers(project, members.map(member => member.user_id)) : [], canManage, members, projectId: project.id }))
      : view === "activity" ? getProjectActivity(project.id).then(activity => ProjectActivitySection({ activity, projectId: project.id }))
      : localizedProject.then(project => ProjectDetails({ actualStartDateAction: updateProjectActualStartDate.bind(null, project.id), calendarTimeSummary, canManage, completionDateAction: updateProjectCompletionDate.bind(null, project.id), locale, project }));
    void pending.catch(() => {});
    content = <Suspense fallback={<ProjectSectionBlueprint view={view} />}><ProjectSectionStream name={`project-${view}`} pending={pending} /></Suspense>;
    if (view === "finance") content = <DomainMessages scope="finance">{content}</DomainMessages>;
  }
  return <ProjectLifecycleProvider key={`${project.id}:${isArchived}`} initialStatus={project.status}><ProjectWorkspaceNavigation key={`${project.id}:${profile.id}:${canManage}:${locale}`} projectId={project.id} snapshot={{ search: renderedSearch.toString(), key: projectWorkspaceSurfaceKey({ view, directionId }, query), revision: createHash("sha256").update(JSON.stringify([project, configuration, progressTasks])).digest("hex"), content, overview }} input={{ directions: configuration.directions ?? [], stages: configuration.stages, tasks: progressTasks }}><ProjectWorkspace key={project.id} overview={overview} contextFallback={<ProjectContextBlueprint project={project} />} context={<WorkspaceContextStream pending={context} workspaceProps={workspaceProps}/>} board={content}/></ProjectWorkspaceNavigation></ProjectLifecycleProvider>;
}

async function WorkspaceContextStream({ pending, workspaceProps }: { pending: Promise<ComponentProps<typeof ProjectWorkspaceContext>["data"]>; workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceContext>, "data"> }) {
  return <ProjectWorkspaceContext {...workspaceProps} data={await pending} />;
}

async function WorkspaceBoardStream({ pending, workspaceProps }: { pending: Promise<ComponentProps<typeof ProjectWorkspaceBoard>["data"]>; workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceBoard>, "data"> }) {
  return <ProjectWorkspaceBoard {...workspaceProps} data={await pending} />;
}

async function ProjectSectionStream({ name, pending }: { name: string; pending: Promise<ReactNode> }) {
  const content = await pending;
  return <InstaLoadReady name={name} className="instaload-panel"><div>{content}</div></InstaLoadReady>;
}

async function CalendarTimeStream({ pending }: { pending: ReturnType<typeof getProjectCalendarTime> }) {
  const [calendarTime, t] = await Promise.all([pending, getTranslations("ProjectWorkspace")]);
  const hours = Math.floor(calendarTime.minutes / 60);
  const minutes = calendarTime.minutes % 60;
  const duration = [hours && `${hours} ${t("hoursShort")}`, minutes && `${minutes} ${t("minutesShort")}`].filter(Boolean).join(" ") || `0 ${t("minutesShort")}`;
  return <span data-project-calendar-ready>{calendarTime.count ? `${calendarTime.count} · ${duration}` : "0"}</span>;
}

async function ProjectDetails({ actualStartDateAction, calendarTimeSummary, canManage, completionDateAction, locale, project }: { actualStartDateAction: ProjectFormAction; calendarTimeSummary: ReactNode; canManage: boolean; completionDateAction: ProjectFormAction; locale: string; project: NonNullable<Awaited<ReturnType<typeof getProjectById>>> }) {
  const [t, form, projectTypes, priorities] = await Promise.all([getTranslations("ProjectWorkspace"), getTranslations("ProjectForm"), getTranslations("ProjectTypes"), getTranslations("Priority")]);
  const typeLabel = getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes);
  const items = [
    { label: form("projectType"), value: typeLabel },
    { label: form("clientName"), value: project.client_name },
    { label: form("country"), value: getCountryName(project.country_code, locale) },
    { label: form("city"), value: project.city },
    { label: t("directions.objectArea"), value: `${formatNumber(project.total_area_m2, locale)} m²` },
    { label: t("siteVisits"), value: calendarTimeSummary },
    { label: form("priority"), value: priorities(project.priority) },
  ];
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)]">
    <h2 className="text-base font-semibold text-[var(--ui-text)]">{t("directions.projectOverview")}</h2>
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
