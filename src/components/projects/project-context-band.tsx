"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Check, MapPin, MoreHorizontal } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLayoutEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectEditModal } from "@/components/projects/project-edit-modal";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { ProjectProgressSettings } from "@/components/projects/project-progress-settings";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { calculateProjectProgress, getProjectHealth, getProjectHealthLabel, getTodayDateOnly, isProjectProgressMethod } from "@/lib/project-progress";
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle } from "@/lib/semantic-styles";
import { getTaskPriorityLabel } from "@/lib/tasks";
import { formatDateOnly, formatNumber } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { getProjectTypeDisplayName, isProjectPriority } from "@/lib/validation/project";
import type { ProjectTask } from "@/types/tasks";

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
  progress_method: string;
  start_date: string;
  total_area_m2: number;
};

export function ProjectContextBand({ archiveAction, canManage, currentUserId, isArchived, project, restoreAction, tasks, updateAction }: {
  archiveAction: (formData: FormData) => Promise<void>;
  canManage: boolean;
  currentUserId: string;
  isArchived: boolean;
  project: ProjectContextProject;
  restoreAction: (formData: FormData) => Promise<void>;
  tasks: ProjectTask[];
  updateAction: ProjectFormAction;
}) {
  const t = useTranslations("Workspace");
  const common = useTranslations("Common");
  const form = useTranslations("ProjectForm");
  const projectMessages = useTranslations("Projects");
  const projectTypes = useTranslations("ProjectTypes");
  const statusMessages = useTranslations("Status");
  const locale = useLocale();
  const { status } = useProjectLifecycle();
  const progress = calculateProjectProgress(tasks, undefined, {
    method: isProjectProgressMethod(project.progress_method) ? project.progress_method : "equal",
    designScopeAreaM2: Number(project.total_area_m2),
  });
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

  return <section aria-labelledby="project-context-heading" className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]">
    <div className={compact ? "flex flex-col gap-2 px-4 py-2.5 sm:px-5 lg:flex-row lg:items-start lg:justify-between" : "flex flex-col gap-4 px-4 py-4 sm:px-5 xl:flex-row xl:items-start xl:justify-between"}>
      <div className="min-w-0">
        <Link href="/projects" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToProjects")}
        </Link>
        <div className={compact ? "mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5" : "mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"}><h1 id="project-context-heading" className={`flex min-w-0 items-center gap-2 break-words font-semibold tracking-tight text-[var(--ui-text)] ${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`}><LifecycleDot label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} />{project.name}</h1>{!isArchived ? <Badge className={`font-semibold ${healthStyle.className}`} label={getProjectHealthLabel(health.health)} /> : null}<Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} /></div>
        {(project.client_name || location || project.project_code) ? <div className={compact ? "mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--ui-text-muted)]" : "mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-[var(--ui-text-muted)]"}>{project.client_name ? <p className="flex min-w-0 items-center gap-1.5"><span aria-label={form("clientName")} title={form("clientName")}><Building2 aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /></span><span className="truncate text-[var(--ui-text-secondary)]">{project.client_name}</span></p> : null}{location ? <p className="flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /><span className="truncate" title={location}>{location}</span></p> : null}{project.project_code ? <p className="ui-numeric text-xs font-medium text-[var(--ui-text-muted)]">{project.project_code}</p> : null}</div> : null}
      </div>
      <ProjectContextActions archiveAction={archiveAction} canManage={canManage} compact={compact} isArchived={isArchived} onToggleCompact={toggleCompact} project={project} restoreAction={restoreAction} status={status} tasks={tasks} updateAction={updateAction} />
    </div>

    <div className={compact ? "border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-3 sm:px-5" : "grid gap-5 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] lg:gap-8"}>
      <div className={compact ? "grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:gap-5" : "contents"}>
        <div className={compact ? "grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" : "min-w-0 pt-1"}>
          <ProgressSummary compact={compact} progress={progress} projectName={project.name} />
          <div className={compact ? "grid grid-cols-3 divide-x divide-[var(--ui-border)] border-t border-[var(--ui-border)] pt-2 sm:border-t-0 sm:pt-0" : "mt-4 grid grid-cols-3 gap-3 sm:gap-5"}>
            <SupportingMetric compact={compact} label={projectMessages("openCount", { count: progress.openTaskCount })} value={String(progress.openTaskCount)} />
            <SupportingMetric compact={compact} label={projectMessages("completedCount", { count: progress.completedTaskCount })} value={String(progress.completedTaskCount)} />
            <SupportingMetric compact={compact} danger={progress.overdueTaskCount > 0} label={projectMessages("overdueCount", { count: progress.overdueTaskCount })} value={String(progress.overdueTaskCount)} />
          </div>
        </div>
        <div className={compact ? "border-t border-[var(--ui-border)] pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" : "rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-4 py-3.5 sm:px-5"}>
          <DeadlineSummary compact={compact} locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} overdueTaskCount={progress.overdueTaskCount} projectDueDate={project.due_date} />
          {health.reason && !isArchived ? <p className={compact ? "mt-1.5 text-xs leading-4 text-[var(--ui-text-secondary)]" : "mt-3 text-xs leading-5 text-[var(--ui-text-secondary)]"}>{health.reason}</p> : null}
        </div>
      </div>
    </div>

    <dl className={compact ? "grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--ui-border)] px-4 py-2.5 text-sm sm:grid-cols-3 sm:px-5" : "grid gap-x-6 gap-y-3 bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm sm:grid-cols-3 sm:px-5"}>
      <Metadata compact={compact} label={t("projectType")} value={getProjectTypeDisplayName(project.project_type, project.project_type_custom, projectTypes) ?? common("notAvailable")} />
      <Metadata compact={compact} label={t("totalArea")} value={`${formatNumber(project.total_area_m2, locale)} m²`} />
      <Metadata compact={compact} label={t("startDate")} value={formatDateOnly(project.start_date, locale)} />
    </dl>
  </section>;
}

function ProjectContextActions({ archiveAction, canManage, compact, isArchived, onToggleCompact, project, restoreAction, status, tasks, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; canManage: boolean; compact: boolean; isArchived: boolean; onToggleCompact: () => void; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; tasks: ProjectTask[]; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  const locale = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);
  const compactViewLabel = locale === "uk" ? "Компактний вигляд" : "Compact view";
  return <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{canManage && isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : null}{canManage && !isArchived ? <><ProjectLifecycleControls projectId={project.id} />{status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, project_type_custom: project.project_type_custom ?? undefined, country_code: project.country_code, city: project.city ?? undefined, city_geonames_id: project.city_geonames_id ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date, due_date: project.due_date ?? undefined }} /> : null}</> : null}<PopoverPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}><PopoverPrimitive.Trigger asChild><button type="button" aria-label={t("moreActions")} className="flex size-8 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={8} collisionPadding={16} className="z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]"><button type="button" aria-pressed={compact} onClick={onToggleCompact} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{compactViewLabel}</span>{compact ? <Check aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-action-primary)]" /> : null}</button>{canManage && !isArchived ? <><div className="mt-2 border-t border-[var(--ui-border)] pt-3"><ProjectProgressSettings isReadOnly={status === "completed"} project={project} tasks={tasks} /></div><div className="mt-3 border-t border-[var(--ui-border)] pt-2"><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div></> : null}</PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root></div>;
}

function ProgressSummary({ compact, progress, projectName }: { compact: boolean; progress: ReturnType<typeof calculateProjectProgress>; projectName: string }) {
  const t = useTranslations("Projects");
  if (progress.progressPercent === null) return <div><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><p className={compact ? "mt-0.5 text-sm text-[var(--ui-text-muted)]" : "mt-1 text-sm text-[var(--ui-text-muted)]"}>{t("noTasks")}</p></div>;
  const markerOffset = progress.progressPercent === 100 ? "calc(100% - 0.375rem)" : `${progress.progressPercent}%`;
  return <div><div className="flex items-end justify-between gap-4"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><span className={`ui-numeric font-semibold tracking-tight text-[var(--ui-text)] ${compact ? "text-2xl" : "text-3xl"}`}>{progress.progressPercent}%</span></div><div className={`relative min-w-0 ${compact ? "mt-1.5 h-2.5" : "mt-3 h-3"}`} role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-[var(--ui-progress-track)] ${compact ? "h-1.5" : "h-2"}`} /><div className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-[var(--ui-action-primary)] ${compact ? "h-1.5" : "h-2"}`} style={{ width: `${progress.progressPercent}%` }} />{progress.progressPercent > 0 ? <span aria-hidden="true" className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)] ${compact ? "size-2.5" : "size-3"}`} style={{ left: markerOffset }} /> : null}</div></div>;
}

function DeadlineSummary({ compact, locale, nextTaskDueDate, overdueTaskCount, projectDueDate }: { compact: boolean; locale: string; nextTaskDueDate: string | null; overdueTaskCount: number; projectDueDate: string | null }) {
  const t = useTranslations("Workspace");
  const projectDeadlineNeedsAttention = Boolean(projectDueDate && projectDueDate <= getTodayDateOnly());
  return <div className={compact ? "flex flex-wrap items-baseline gap-x-4 gap-y-1" : "space-y-3"}><TimelineMetric attention={projectDeadlineNeedsAttention} compact={compact} label={t("projectDeadline")} value={projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")} /><TimelineMetric attention={overdueTaskCount > 0} compact={compact} label={t("nextTaskDue")} value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")} />{overdueTaskCount > 0 ? <TimelineMetric attention compact={compact} label={t("overdueTasks", { count: overdueTaskCount })} value={String(overdueTaskCount)} /> : null}</div>;
}

function SupportingMetric({ compact = false, danger = false, label, value }: { compact?: boolean; danger?: boolean; label: string; value: string }) {
  return <div className={compact ? "min-w-0 flex-1 px-2.5 py-2" : "min-w-0"}><p className={`ui-numeric text-base font-semibold ${danger ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p><p className={`mt-0.5 text-xs leading-4 ${danger ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}`}>{label}</p></div>;
}

function TimelineMetric({ attention = false, compact = false, label, value }: { attention?: boolean; compact?: boolean; label: string; value: string }) {
  return <div className={compact ? "flex items-baseline gap-1.5" : "flex items-baseline justify-between gap-4"}><p className="text-xs text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric shrink-0 text-sm font-medium ${attention ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Metadata({ compact = false, label, value }: { compact?: boolean; label: string; value: string }) {
  if (compact) return <div className="min-w-0"><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-0.5 break-words font-medium text-[var(--ui-text-secondary)]">{value}</dd></div>;
  return <div className="min-w-0"><dd className="break-words font-medium text-[var(--ui-text-secondary)]">{value}</dd><dt className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{label}</dt></div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
