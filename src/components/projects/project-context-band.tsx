"use client";

import { ProjectsListLink as Link } from "./projects-list-link";
import styles from "./project-context-band.module.css";
import { ArrowLeft, Building, Building2, Cross, House, MapPin, Pause, Shapes, SlidersHorizontal, UtensilsCrossed, type LucideIcon } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectEditModal } from "@/components/projects/project-edit-modal";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectHealth, type ProjectProgressSummary } from "@/lib/project-progress";
import { getProjectHealthBadgeStyle } from "@/lib/semantic-styles";
import { PROJECT_LIST_HEALTH_LABEL_KEYS } from "@/lib/project-list-presentation";
import { formatDateOnly } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { getProjectTypeDisplayName, isProjectPriority, isProjectTypeKey, type ProjectTypeKey } from "@/lib/validation/project";
import { Tooltip } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

const PROJECT_TYPE_ICONS = { private: House, commercial: Building, horeca: UtensilsCrossed, medical: Cross, other: Shapes } satisfies Record<ProjectTypeKey, LucideIcon>;

export type ProjectContextProject = {
  id: string;
  name: string;
  project_code: string | null;
  project_type: string | null;
  project_type_custom: string | null;
  city: string | null;
  city_geonames_id: number | null;
  site_address: string | null;
  country_code: string;
  client_name: string | null;
  description: string | null;
  due_date: string | null;
  priority: string;
  start_date: string | null;
  total_area_m2: number;
};

export function ProjectContextBand({ archiveAction, backHref = "/projects", calendarTimeSummary, canManage, isArchived, onConfigureStages, project, restoreAction, summary, directionsContent, projectNavigation, updateAction }: {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary?: ReactNode;
  canManage: boolean;
  currentUserId: string;
  isArchived: boolean;
  onConfigureStages?: () => void;
  project: ProjectContextProject;
  restoreAction: (formData: FormData) => Promise<void>;
  summary: ProjectProgressSummary;
  directionsContent?: ReactNode;
  projectNavigation?: ReactNode;
  updateAction: ProjectFormAction;
}) {
  const t = useTranslations("Workspace");
  const projectWorkspace = useTranslations("ProjectWorkspace");
  const common = useTranslations("Common");
  const form = useTranslations("ProjectForm");
  const projectMessages = useTranslations("Projects");
  const projectTypes = useTranslations("ProjectTypes");
  const statusMessages = useTranslations("Status");
  const locale = useLocale();
  const { status } = useProjectLifecycle();
  const isPaused = status === "paused";
  const { progress } = summary;
  const health = getProjectHealth({ projectStatus: status, projectDueDate: project.due_date, progress });
  const healthStyle = getProjectHealthBadgeStyle(health.health);
  const location = [project.city, getCountryName(project.country_code, locale)].filter(Boolean).join(", ");
  const ProjectTypeIcon = isProjectTypeKey(project.project_type) ? PROJECT_TYPE_ICONS[project.project_type] : null;
  const healthReason = health.health === "needs_attention" ? progress.overdueTaskCount > 0
      ? projectWorkspace("overdueTasks", { count: progress.overdueTaskCount })
      : progress.urgentOpenTaskCount > 0 ? projectWorkspace("urgentTasks", { count: progress.urgentOpenTaskCount })
      : projectWorkspace("highPriorityTasks", { count: progress.highPriorityOpenTaskCount })
    : health.health === "deadline_soon" && project.due_date ? projectMessages("projectDeadline", { date: formatDateOnly(project.due_date, locale) }) : null;

  return <section aria-labelledby="project-context-heading" className={styles.sheet}>
    <div className={styles.toolbar}>
      <Link href={backHref} aria-label={t("backToProjects")} className="inline-flex min-h-10 min-w-9 items-center justify-center gap-1.5 rounded-[var(--ui-radius-control)] text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true"/><span className="hidden sm:inline">{t("backToProjects")}</span></Link>
      <ProjectContextActions archiveAction={archiveAction} canManage={canManage} isArchived={isArchived} onConfigureStages={onConfigureStages} project={project} restoreAction={restoreAction} status={status} updateAction={updateAction} />
    </div>
    {!isArchived && isPaused ? <div className={styles.paused}><Pause aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{projectMessages("pausedBannerTitle")}</p><p className="mt-0.5 leading-5 text-[var(--ui-text-secondary)]">{projectMessages("pausedBannerDescription")}</p></div></div> : null}
    <div className={styles.identity}>
      <div className={styles.heading}>
        <h1 id="project-context-heading" className={styles.title}>{project.name}</h1>
        <div className={styles.statuses}>
          <span className={styles.lifecycle}><LifecycleDot label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} /><span aria-hidden="true">{statusMessages(isArchived ? "archived" : status)}</span></span>
          {!isArchived ? <Badge className={healthStyle.className} label={projectMessages(PROJECT_LIST_HEALTH_LABEL_KEYS[health.health])} title={healthReason ?? undefined} /> : null}
        </div>
      </div>
      <div className={styles.identityFooter}><dl className={styles.metadata}>
        {project.project_type ? <div><dt className="sr-only">{t("projectType")}</dt><dd className="font-medium">{ProjectTypeIcon ? <ProjectTypeIcon aria-hidden="true" /> : null}{getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes) ?? common("notAvailable")}</dd></div> : null}
        {project.client_name ? <div><dt className="sr-only">{form("clientName")}</dt><dd><Building2 aria-hidden="true" />{project.client_name}</dd></div> : null}
        {location ? <div><dt className="sr-only">{form("city")}</dt><dd><MapPin aria-hidden="true" />{location}</dd></div> : null}
        {calendarTimeSummary ? <div><dt className="sr-only">{projectWorkspace("siteVisits")}</dt><dd><MapPin aria-hidden="true" /><span>{projectWorkspace("siteVisits")}: {calendarTimeSummary}</span></dd></div> : null}
      </dl>{projectNavigation}</div>
    </div>
    {directionsContent}
  </section>;
}

function ProjectContextActions({ archiveAction, canManage, isArchived, onConfigureStages, project, restoreAction, status, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; canManage: boolean; isArchived: boolean; onConfigureStages?: () => void; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  const stages = useTranslations("StageConfiguration");
  if (!canManage) return null;
  return <div className={styles.actions}>
    {isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : <>
      {status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, project_type_custom: project.project_type_custom ?? undefined, country_code: project.country_code, city: project.city ?? undefined, city_geonames_id: project.city_geonames_id ?? undefined, site_address: project.site_address ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date ?? undefined, due_date: project.due_date ?? undefined }} /> : null}
      <ProjectLifecycleControls projectId={project.id}>
        {onConfigureStages ? <PopoverPrimitive.Close asChild><button type="button" onClick={onConfigureStages} className={styles.menuAction}><SlidersHorizontal aria-hidden="true" className="size-4" />{stages("configure")}</button></PopoverPrimitive.Close> : null}
        <div className={styles.archiveAction}><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div>
      </ProjectLifecycleControls>
    </>}
  </div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <Tooltip content={label}><span role="img" aria-label={label} tabIndex={0} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span></Tooltip>;
}

function Badge({ className, label, title }: { className: string; label: string; title?: string }) {
  return <Tooltip content={title}><span tabIndex={0} className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${className}`}>{label}</span></Tooltip>;
}
