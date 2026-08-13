"use client";

import Link from "next/link";
import { ArrowLeft, Building2, MapPin, MoreHorizontal } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useState } from "react";
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
import { isProjectPriority, isProjectTypeKey } from "@/lib/validation/project";
import type { ProjectTask } from "@/types/tasks";

export type ProjectContextProject = {
  id: string;
  name: string;
  project_code: string | null;
  project_type: string | null;
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

export function ProjectContextBand({ archiveAction, canManage, isArchived, project, restoreAction, tasks, updateAction }: {
  archiveAction: (formData: FormData) => Promise<void>;
  canManage: boolean;
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

  return <section aria-labelledby="project-context-heading" className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]">
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0">
        <Link href="/projects" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToProjects")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"><h1 id="project-context-heading" className="flex min-w-0 items-center gap-2 break-words text-2xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-3xl"><LifecycleDot label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} />{project.name}</h1>{!isArchived ? <Badge className={`font-semibold ${healthStyle.className}`} label={getProjectHealthLabel(health.health)} /> : null}<Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} /></div>
        {(project.client_name || location || project.project_code) ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-[var(--ui-text-muted)]">{project.client_name ? <p className="flex min-w-0 items-center gap-1.5"><span aria-label={form("clientName")} title={form("clientName")}><Building2 aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /></span><span className="truncate text-[var(--ui-text-secondary)]">{project.client_name}</span></p> : null}{location ? <p className="flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /><span className="truncate" title={location}>{location}</span></p> : null}{project.project_code ? <p className="ui-numeric text-xs font-medium text-[var(--ui-text-muted)]">{project.project_code}</p> : null}</div> : null}
      </div>
      {canManage ? <ProjectContextActions archiveAction={archiveAction} isArchived={isArchived} project={project} restoreAction={restoreAction} status={status} tasks={tasks} updateAction={updateAction} /> : null}
    </div>

    <div className="grid gap-5 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] lg:gap-8">
      <div className="min-w-0 pt-1">
        <ProgressSummary progress={progress} projectName={project.name} />
        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-5">
          <SupportingMetric label={projectMessages("openCount", { count: progress.openTaskCount })} value={String(progress.openTaskCount)} />
          <SupportingMetric label={projectMessages("completedCount", { count: progress.completedTaskCount })} value={String(progress.completedTaskCount)} />
          <SupportingMetric danger={progress.overdueTaskCount > 0} label={projectMessages("overdueCount", { count: progress.overdueTaskCount })} value={String(progress.overdueTaskCount)} />
        </div>
      </div>
      <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-4 py-3.5 sm:px-5">
        <DeadlineSummary locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} overdueTaskCount={progress.overdueTaskCount} projectDueDate={project.due_date} />
        {health.reason && !isArchived ? <p className="mt-3 text-xs leading-5 text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
      </div>
    </div>

    <dl className="grid gap-x-6 gap-y-3 bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm sm:grid-cols-3 sm:px-5">
      <Metadata label={t("projectType")} value={project.project_type ? (isProjectTypeKey(project.project_type) ? projectTypes(project.project_type) : project.project_type) : common("notAvailable")} />
      <Metadata label={t("totalArea")} value={`${formatNumber(project.total_area_m2, locale)} m²`} />
      <Metadata label={t("startDate")} value={formatDateOnly(project.start_date, locale)} />
    </dl>
  </section>;
}

function ProjectContextActions({ archiveAction, isArchived, project, restoreAction, status, tasks, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; isArchived: boolean; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; tasks: ProjectTask[]; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  const [moreOpen, setMoreOpen] = useState(false);
  return <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : <><ProjectLifecycleControls projectId={project.id} />{status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, country_code: project.country_code, city: project.city ?? undefined, city_geonames_id: project.city_geonames_id ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date, due_date: project.due_date ?? undefined }} /> : null}<PopoverPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}><PopoverPrimitive.Trigger asChild><button type="button" aria-label={t("moreActions")} className="flex size-8 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={8} collisionPadding={16} className="z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]"><ProjectProgressSettings isReadOnly={status === "completed"} project={project} tasks={tasks} /><div className="mt-3 border-t border-[var(--ui-border)] pt-2"><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root></>}</div>;
}

function ProgressSummary({ progress, projectName }: { progress: ReturnType<typeof calculateProjectProgress>; projectName: string }) {
  const t = useTranslations("Projects");
  if (progress.progressPercent === null) return <div><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("noTasks")}</p></div>;
  const markerOffset = progress.progressPercent === 100 ? "calc(100% - 0.375rem)" : `${progress.progressPercent}%`;
  return <div><div className="flex items-end justify-between gap-4"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><span className="ui-numeric text-3xl font-semibold tracking-tight text-[var(--ui-text)]">{progress.progressPercent}%</span></div><div className="relative mt-3 h-3 min-w-0" role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-progress-track)]" /><div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} />{progress.progressPercent > 0 ? <span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)]" style={{ left: markerOffset }} /> : null}</div></div>;
}

function DeadlineSummary({ locale, nextTaskDueDate, overdueTaskCount, projectDueDate }: { locale: string; nextTaskDueDate: string | null; overdueTaskCount: number; projectDueDate: string | null }) {
  const t = useTranslations("Workspace");
  const projectDeadlineNeedsAttention = Boolean(projectDueDate && projectDueDate <= getTodayDateOnly());
  return <div className="space-y-3"><TimelineMetric attention={projectDeadlineNeedsAttention} label={t("projectDeadline")} value={projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")} /><TimelineMetric attention={overdueTaskCount > 0} label={t("nextTaskDue")} value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")} />{overdueTaskCount > 0 ? <TimelineMetric attention label={t("overdueTasks", { count: overdueTaskCount })} value={String(overdueTaskCount)} /> : null}</div>;
}

function SupportingMetric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div className="min-w-0"><p className={`ui-numeric text-base font-semibold ${danger ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p><p className={`mt-0.5 text-xs leading-4 ${danger ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}`}>{label}</p></div>;
}

function TimelineMetric({ attention = false, label, value }: { attention?: boolean; label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-4"><p className="text-xs text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric shrink-0 text-sm font-medium ${attention ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dd className="break-words font-medium text-[var(--ui-text-secondary)]">{value}</dd><dt className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{label}</dt></div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
