"use client";

import Link from "next/link";
import styles from "./project-context-band.module.css";
import { ArrowLeft, Building, Building2, CalendarClock, CalendarDays, Cross, Flag, House, MapPin, Pause, Ruler, Shapes, SlidersHorizontal, UtensilsCrossed, type LucideIcon } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectEditModal } from "@/components/projects/project-edit-modal";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectHealth, getTodayDateOnly, type ProjectProgressSummary } from "@/lib/project-progress";
import { getProjectHealthBadgeStyle } from "@/lib/semantic-styles";
import { PROJECT_LIST_HEALTH_LABEL_KEYS } from "@/lib/project-list-presentation";
import { formatDateOnly, formatNumber } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { getProjectTypeDisplayName, isProjectPriority, isProjectTypeKey, type ProjectTypeKey } from "@/lib/validation/project";
import type { ConfiguredProjectStage } from "@/data/queries/project-stage-columns";

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
  start_date: string;
  total_area_m2: number;
};

export function ProjectContextBand({ archiveAction, backHref = "/projects", calendarTimeSummary, canManage, isArchived, onConfigureStages, project, restoreAction, summary, showProgress = true, stages, updateAction }: {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary: string;
  canManage: boolean;
  currentUserId: string;
  isArchived: boolean;
  onConfigureStages?: () => void;
  project: ProjectContextProject;
  restoreAction: (formData: FormData) => Promise<void>;
  summary: ProjectProgressSummary;
  showProgress?: boolean;
  stages?: ConfiguredProjectStage[];
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
  const { progress, stageProgress } = summary;
  const health = getProjectHealth({ projectStatus: status, projectDueDate: project.due_date, progress });
  const healthStyle = getProjectHealthBadgeStyle(health.health);
  const location = [project.city, getCountryName(project.country_code, locale)].filter(Boolean).join(", ");
  const ProjectTypeIcon = isProjectTypeKey(project.project_type) ? PROJECT_TYPE_ICONS[project.project_type] : null;
  const healthReason = health.health === "needs_attention" ? progress.overdueTaskCount > 0
      ? projectWorkspace("overdueTasks", { count: progress.overdueTaskCount })
      : progress.urgentOpenTaskCount > 0 ? projectWorkspace("urgentTasks", { count: progress.urgentOpenTaskCount })
      : projectWorkspace("highPriorityTasks", { count: progress.highPriorityOpenTaskCount })
    : health.health === "deadline_soon" && project.due_date ? projectMessages("projectDeadline", { date: formatDateOnly(project.due_date, locale) }) : null;

  const taskStats = <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
    <span className="font-medium text-[var(--ui-text-secondary)]">{projectMessages("openCount", { count: progress.openTaskCount })}</span>
    <span className="text-[var(--ui-text-muted)]">{projectMessages("completedCount", { count: progress.completedTaskCount })}</span>
    {!isPaused ? <span className={progress.overdueTaskCount > 0 ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}>{projectMessages("overdueCount", { count: progress.overdueTaskCount })}</span> : null}
  </div>;

  return <section aria-labelledby="project-context-heading" className={styles.sheet}>
    <div className={styles.toolbar}>
      <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />{t("backToProjects")}</Link>
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
      <dl className={styles.metadata}>
        <div><dt className="sr-only">{t("projectType")}</dt><dd className="font-medium">{ProjectTypeIcon ? <ProjectTypeIcon aria-hidden="true" /> : null}{getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes) ?? common("notAvailable")}</dd></div>
        {project.client_name ? <div><dt className="sr-only">{form("clientName")}</dt><dd><Building2 aria-hidden="true" />{project.client_name}</dd></div> : null}
        {location ? <div><dt className="sr-only">{form("city")}</dt><dd><MapPin aria-hidden="true" />{location}</dd></div> : null}
      </dl>
    </div>
    <div className={styles.measurements}>
      {showProgress ? <ProgressSummary progress={progress} projectName={project.name} stageProgress={stageProgress} stages={stages} /> : null}
      <div className={styles.taskLine}>{taskStats}</div>
    </div>
    <DeadlineSummary area={project.total_area_m2} calendarTimeSummary={calendarTimeSummary} locale={locale} priority={project.priority} paused={isPaused} projectDueDate={project.due_date} siteVisitsLabel={projectWorkspace("siteVisits")} startDate={project.start_date} />
  </section>;
}

function ProjectContextActions({ archiveAction, canManage, isArchived, onConfigureStages, project, restoreAction, status, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; canManage: boolean; isArchived: boolean; onConfigureStages?: () => void; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  const stages = useTranslations("StageConfiguration");
  if (!canManage) return null;
  return <div className={styles.actions}>
    {isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : <>
      {status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, project_type_custom: project.project_type_custom ?? undefined, country_code: project.country_code, city: project.city ?? undefined, city_geonames_id: project.city_geonames_id ?? undefined, site_address: project.site_address ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date, due_date: project.due_date ?? undefined }} /> : null}
      <ProjectLifecycleControls projectId={project.id}>
        {onConfigureStages ? <PopoverPrimitive.Close asChild><button type="button" onClick={onConfigureStages} className={styles.menuAction}><SlidersHorizontal aria-hidden="true" className="size-4" />{stages("configure")}</button></PopoverPrimitive.Close> : null}
        <div className={styles.archiveAction}><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div>
      </ProjectLifecycleControls>
    </>}
  </div>;
}

function ProgressSummary({ progress, projectName, stageProgress, stages }: { progress: ProjectProgressSummary["progress"]; projectName: string; stageProgress: ProjectProgressSummary["stageProgress"]; stages?: ConfiguredProjectStage[] }) {
  const t = useTranslations("Projects");
  const stageLabels = useTranslations("TaskStages");
  if (progress.eligibleTaskCount === 0) return <div><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("noTasks")}</p></div>;
  const visibleStages = Object.entries(stageProgress).filter(([stage]) => stages?.find((item) => item.stage === stage)?.isEnabled ?? true);
  return <div className={styles.progress}>
    <div className={styles.overall}>
      <p className={styles.progressLabel}>{t("progress")}</p>
      <span className={styles.overallValue}>{progress.progressPercent}<span>%</span></span>
      <div className={styles.trackWrap}>
        <div className={styles.overallTrack} role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div style={{ width: progress.progressPercent + "%" }} /></div>
      </div>
    </div>
    <div className={styles.stages}>
      {visibleStages.map(([stage, value]) => {
        const label = stages?.find((item) => item.stage === stage)?.displayName ?? stageLabels(stage);
        return <div key={stage} className={styles.stage}>
          <p className={styles.progressLabel}>{label}</p>
          <span className={styles.stageValue}>{value.progressPercent}<span>%</span></span>
          <div className={styles.trackWrap}>
            <div className={styles.stageTrack} role="progressbar" aria-label={label + " " + value.progressPercent + "%"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.progressPercent}><div style={{ width: value.progressPercent + "%" }} /></div>
            {value.progressPercent > 0 ? <span aria-hidden="true" className={`${styles.endpoint} ${styles.stageEndpoint}`} style={{ left: value.progressPercent + "%" }} /> : null}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function DeadlineSummary({ area, calendarTimeSummary, locale, priority, paused, projectDueDate, siteVisitsLabel, startDate }: { area: number; calendarTimeSummary: string; locale: string; priority: string; paused: boolean; projectDueDate: string | null; siteVisitsLabel: string; startDate: string }) {
  const t = useTranslations("Workspace");
  const projects = useTranslations("Projects");
  const workspace = useTranslations("ProjectWorkspace");
  const priorities = useTranslations("Priority");
  const common = useTranslations("Common");
  const projectDeadlineNeedsAttention = !paused && Boolean(projectDueDate && projectDueDate <= getTodayDateOnly());
  return <dl className={styles.dates}>
    <div><dt><CalendarDays aria-hidden="true" />{t("startDate")}</dt><dd>{formatDateOnly(startDate, locale)}</dd></div>
    <div><dt><CalendarClock aria-hidden="true" />{t("projectDeadline")}</dt><dd className={projectDeadlineNeedsAttention ? "text-[var(--ui-danger-text)]" : undefined}>{projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")}</dd></div>
    <div><dt><Ruler aria-hidden="true" />{t("totalArea")}</dt><dd className="ui-numeric">{workspace("areaValue", { area: formatNumber(area, locale) })}</dd></div>
    <div><dt><Flag aria-hidden="true" />{projects("priority")}</dt><dd className={priority === "urgent" ? "text-[var(--ui-urgent-text)]" : priority === "high" ? "text-[var(--ui-warning-text)]" : undefined}>{isProjectPriority(priority) ? priorities(priority) : common("notAvailable")}</dd></div>
    <div><dt><MapPin aria-hidden="true" />{siteVisitsLabel}</dt><dd>{calendarTimeSummary}</dd></div>
  </dl>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function Badge({ className, label, title }: { className: string; label: string; title?: string }) {
  return <span title={title} className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${className}`}>{label}</span>;
}
