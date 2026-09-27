"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Check, MapPin, MoreHorizontal, Pause } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLayoutEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectEditModal } from "@/components/projects/project-edit-modal";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { calculateProjectProgress, calculateStageProgress, getProjectHealth, getProjectHealthLabel, getTodayDateOnly, type ProjectStageProgressMethods, type ProjectTaskForProgress } from "@/lib/project-progress";
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle } from "@/lib/semantic-styles";
import { getTaskPriorityLabel } from "@/lib/tasks";
import { formatDateOnly, formatNumber } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { getProjectTypeDisplayName, isProjectPriority } from "@/lib/validation/project";
import type { ConfiguredProjectStage } from "@/data/queries/project-stage-columns";

export type ProjectContextProject = {
  id: string;
  name: string;
  project_code: string | null;
  project_type: string | null;
  project_type_custom: string | null;
  city: string | null;
  city_geonames_id: number | null;
  country_code: string;
  client_name: string | null;
  description: string | null;
  due_date: string | null;
  priority: string;
  start_date: string;
  total_area_m2: number;
};

export function ProjectContextBand({ archiveAction, backHref = "/projects", calendarTimeSummary, canManage, currentUserId, isArchived, onConfigureStages, project, restoreAction, stageProgressMethods, showProgress = true, stages, tasks, updateAction }: {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary: string;
  canManage: boolean;
  currentUserId: string;
  isArchived: boolean;
  onConfigureStages?: () => void;
  project: ProjectContextProject;
  restoreAction: (formData: FormData) => Promise<void>;
  stageProgressMethods: ProjectStageProgressMethods;
  showProgress?: boolean;
  stages?: ConfiguredProjectStage[];
  tasks: ProjectTaskForProgress[];
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
  const progress = calculateProjectProgress(tasks, undefined, stageProgressMethods);
  const stageProgress = calculateStageProgress(tasks, stageProgressMethods);
  const health = getProjectHealth({ projectStatus: status, projectDueDate: project.due_date, progress });
  const healthStyle = getProjectHealthBadgeStyle(health.health);
  const priorityStyle = getPriorityBadgeStyle(project.priority);
  const location = [project.city, getCountryName(project.country_code, locale)].filter(Boolean).join(", ");
  const layoutStorageKey = `studioflow:project-summary-layout:${currentUserId}`;
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    window.queueMicrotask(() => {
      try {
        setCompact(window.localStorage.getItem(layoutStorageKey) === "compact");
      } catch {
        setCompact(false);
      }
    });
  }, [layoutStorageKey]);

  function toggleCompact() {
    setCompact((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(layoutStorageKey, next ? "compact" : "full");
      } catch {
        // Local presentation preferences must never block the workspace.
      }
      return next;
    });
  }

  const taskStats = <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
    <span className="font-medium text-[var(--ui-text-secondary)]">{projectMessages("openCount", { count: progress.openTaskCount })}</span>
    <span className="text-[var(--ui-text-muted)]">{projectMessages("completedCount", { count: progress.completedTaskCount })}</span>
    {!isPaused ? <span className={progress.overdueTaskCount > 0 ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}>{projectMessages("overdueCount", { count: progress.overdueTaskCount })}</span> : null}
  </div>;

  return <section aria-labelledby="project-context-heading" className="@container overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]">
    <div className={"flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 sm:px-5 " + (compact ? "pt-2.5" : "pt-4")}>
      <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />{t("backToProjects")}</Link>
      <ProjectContextActions archiveAction={archiveAction} canManage={canManage} compact={compact} isArchived={isArchived} onConfigureStages={onConfigureStages} onToggleCompact={toggleCompact} project={project} restoreAction={restoreAction} status={status} updateAction={updateAction} />
    </div>
    {!isArchived && isPaused ? <div className={"mx-4 flex items-start gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] px-3 py-2.5 text-sm text-[var(--ui-info-text)] sm:mx-5 " + (compact ? "mt-2" : "mt-3")}><Pause aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{projectMessages("pausedBannerTitle")}</p><p className="mt-0.5 leading-5 text-[var(--ui-text-secondary)]">{projectMessages("pausedBannerDescription")}</p></div></div> : null}
    <div className={"grid min-w-0 gap-5 px-4 sm:px-5 @min-[56rem]:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] @min-[56rem]:gap-7 " + (compact ? "pb-3 pt-3" : "pb-5 pt-4")}>
      <div className="flex min-w-0 flex-col">
        <div className="min-w-0">
          <h1 id="project-context-heading" className={"flex min-w-0 items-start gap-2.5 break-words font-semibold leading-[1.18] tracking-tight text-[var(--ui-text)] " + (compact ? "text-2xl" : "text-[1.75rem]")}><span className="mt-[0.45em] flex shrink-0"><LifecycleDot label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} /></span><span className="min-w-0">{project.name}</span></h1>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">{!isArchived ? <Badge className={"font-semibold " + healthStyle.className} label={getProjectHealthLabel(health.health)} /> : null}<Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} /></div>
          {health.reason && !isArchived ? <p className="mt-2 text-xs leading-5 text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
        </div>
        <div className={"border-t border-[var(--ui-border)] " + (compact ? "mt-3 pt-3" : "mt-4 pt-4")}>
          <dl className="flex flex-wrap items-end gap-x-5 gap-y-1.5"><div><dt className="sr-only">{t("totalArea")}</dt><dd className="ui-numeric text-[1.875rem] font-semibold leading-none tracking-tight text-[var(--ui-text)]">{formatNumber(project.total_area_m2, locale)} <span className="text-base font-medium text-[var(--ui-text-secondary)]">m²</span></dd></div><div className="min-w-0"><dt className="sr-only">{t("projectType")}</dt><dd className="break-words text-sm font-medium text-[var(--ui-text-secondary)]">{getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes) ?? common("notAvailable")}</dd></div></dl>
          {(project.client_name || location) ? <div className="mt-4 space-y-1.5 text-sm leading-5 text-[var(--ui-text-secondary)]">{project.client_name ? <p className="flex min-w-0 items-start gap-2 font-medium"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-subtle)]" /><span aria-label={form("clientName")} className="min-w-0 break-words">{project.client_name}</span></p> : null}{location ? <p className="flex min-w-0 items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-subtle)]" /><span className="min-w-0 break-words">{location}</span></p> : null}</div> : null}
          <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("startDate")} <span className="ui-numeric ml-1 font-medium text-[var(--ui-text-secondary)]">{formatDateOnly(project.start_date, locale)}</span></p>
        </div>
        {!showProgress ? <div className="mt-4">{taskStats}</div> : null}
      </div>
      <div className={"min-w-0 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] " + (compact ? "p-3" : "p-4")}>
        {showProgress ? <><ProgressSummary compact={compact} progress={progress} projectName={project.name} stageProgress={stageProgress} stages={stages} /><div className="mt-3">{taskStats}</div></> : null}
        <div className={showProgress ? "mt-3 border-t border-[var(--ui-border)] pt-3" : ""}>
          <DeadlineSummary calendarTimeSummary={calendarTimeSummary} compact={compact} locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} overdueTaskCount={progress.overdueTaskCount} paused={isPaused} projectDueDate={project.due_date} siteVisitsLabel={projectWorkspace("siteVisits")} />
        </div>
      </div>
    </div>
  </section>;
}

function ProjectContextActions({ archiveAction, canManage, compact, isArchived, onConfigureStages, onToggleCompact, project, restoreAction, status, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; canManage: boolean; compact: boolean; isArchived: boolean; onConfigureStages?: () => void; onToggleCompact: () => void; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  const stages = useTranslations("StageConfiguration");
  const locale = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);
  const compactViewLabel = locale === "uk" ? "Компактний вигляд" : "Compact view";
  return <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{canManage && isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : null}{canManage && !isArchived ? <><ProjectLifecycleControls projectId={project.id} />{status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, project_type_custom: project.project_type_custom ?? undefined, country_code: project.country_code, city: project.city ?? undefined, city_geonames_id: project.city_geonames_id ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date, due_date: project.due_date ?? undefined }} /> : null}</> : null}<PopoverPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}><PopoverPrimitive.Trigger asChild><button type="button" aria-label={t("moreActions")} className="flex size-8 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={8} collisionPadding={16} className="z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]">{canManage && !isArchived && onConfigureStages ? <button type="button" onClick={() => { setMoreOpen(false); onConfigureStages(); }} className="flex min-h-10 w-full items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{stages("configure")}</button> : null}<button type="button" aria-pressed={compact} onClick={onToggleCompact} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{compactViewLabel}</span>{compact ? <Check aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-action-primary)]" /> : null}</button>{canManage && !isArchived ? <div className="mt-3 border-t border-[var(--ui-border)] pt-2"><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div> : null}</PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root></div>;
}

function ProgressSummary({ compact, progress, projectName, stageProgress, stages }: { compact: boolean; progress: ReturnType<typeof calculateProjectProgress>; projectName: string; stageProgress: ReturnType<typeof calculateStageProgress>; stages?: ConfiguredProjectStage[] }) {
  const t = useTranslations("Projects");
  const stageLabels = useTranslations("TaskStages");
  if (progress.eligibleTaskCount === 0) return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">{t("progress")}</p><p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("noTasks")}</p></div>;
  const visibleStages = Object.entries(stageProgress).filter(([stage]) => stages?.find((item) => item.stage === stage)?.isEnabled ?? true);
  return <div className="min-w-0">
    <div className="flex items-end justify-between gap-3"><p className="text-xs font-medium text-[var(--ui-text-muted)]">{t("progress")}</p><span className={"ui-numeric font-semibold leading-none tracking-tight text-[var(--ui-text)] " + (compact ? "text-2xl" : "text-[1.75rem]")}>{progress.progressPercent}%</span></div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--ui-progress-track)]" role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: progress.progressPercent + "%" }} /></div>
    <div className={"grid grid-cols-3 gap-x-2 gap-y-3 " + (compact ? "mt-3" : "mt-4")}>
      {visibleStages.map(([stage, value]) => {
        const label = stages?.find((item) => item.stage === stage)?.displayName ?? stageLabels(stage);
        return <div key={stage} className="flex min-w-0 flex-col items-center gap-1.5 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:gap-2">
          <svg viewBox="0 0 48 48" role="progressbar" aria-label={label + " " + value.progressPercent + "%"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.progressPercent} className={"ui-numeric shrink-0 " + (compact ? "size-10" : "size-11 @min-[70rem]:size-12")}>
            <circle cx="24" cy="24" r="19" fill="none" stroke="var(--ui-border-strong)" strokeWidth="3.5" />
            {value.progressPercent > 0 ? <circle cx="24" cy="24" r="19" fill="none" stroke="var(--ui-action-primary)" strokeWidth="3.5" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - value.progressPercent} transform="rotate(-90 24 24)" /> : null}
            <text x="24" y="25" textAnchor="middle" dominantBaseline="middle" fill="var(--ui-text)" fontSize="11" fontWeight="600">{value.progressPercent}%</text>
          </svg>
          <span className="min-w-0 break-words text-center text-xs font-medium leading-4 text-[var(--ui-text-secondary)] @min-[30rem]:text-left">{label}</span>
        </div>;
      })}
    </div>
  </div>;
}

function DeadlineSummary({ calendarTimeSummary, compact, locale, nextTaskDueDate, overdueTaskCount, paused, projectDueDate, siteVisitsLabel }: { calendarTimeSummary: string; compact: boolean; locale: string; nextTaskDueDate: string | null; overdueTaskCount: number; paused: boolean; projectDueDate: string | null; siteVisitsLabel: string }) {
  const t = useTranslations("Workspace");
  const projectDeadlineNeedsAttention = !paused && Boolean(projectDueDate && projectDueDate <= getTodayDateOnly());
  return <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 @min-[42rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.75fr)]">
    <div className="min-w-0"><p className="text-xs text-[var(--ui-text-muted)]">{t("projectDeadline")}</p><p className={"ui-numeric mt-1 break-words font-semibold leading-snug " + (projectDeadlineNeedsAttention ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]") + (compact ? " text-base" : " text-lg")}>{projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")}</p></div>
    <div className="min-w-0"><p className="text-xs text-[var(--ui-text-muted)]">{t("nextTaskDue")}</p><p className={"ui-numeric mt-1 break-words text-sm font-medium leading-snug " + (!paused && overdueTaskCount > 0 ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]")}>{nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")}</p></div>
    <div className="col-span-2 min-w-0 @min-[42rem]:col-span-1"><p className="text-xs text-[var(--ui-text-muted)]">{siteVisitsLabel}</p><p className="ui-numeric mt-1 break-words text-sm font-semibold text-[var(--ui-text)]">{calendarTimeSummary}</p></div>
  </div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
