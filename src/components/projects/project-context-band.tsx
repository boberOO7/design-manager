"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, MoreHorizontal } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectEditModal } from "@/components/projects/project-edit-modal";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { ProjectProgressSettings } from "@/components/projects/project-progress-settings";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { calculateProjectProgress, getProjectHealth, getProjectHealthLabel, isProjectProgressMethod } from "@/lib/project-progress";
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"><h1 id="project-context-heading" className="break-words text-2xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-3xl">{project.name}</h1><LifecycleStatus label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} /><div className="flex flex-wrap gap-1.5"><Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} />{!isArchived ? <Badge className={healthStyle.className} label={getProjectHealthLabel(health.health)} /> : null}</div>{project.client_name ? <p className="flex items-baseline gap-1.5 text-sm"><span className="text-xs font-medium text-[var(--ui-text-muted)]">{form("clientName")}</span><span className="font-semibold text-[var(--ui-text-secondary)]">{project.client_name}</span></p> : null}{location ? <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5 text-[var(--ui-text-muted)]"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /><span className="truncate" title={location}>{location}</span></p> : null}{project.project_code ? <p className="text-xs font-medium text-[var(--ui-text-muted)]">{project.project_code}</p> : null}</div>
      </div>
      {canManage ? <ProjectContextActions archiveAction={archiveAction} isArchived={isArchived} project={project} restoreAction={restoreAction} status={status} tasks={tasks} updateAction={updateAction} /> : null}
    </div>

    <div className="grid border-t border-[var(--ui-border)] lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <div className="p-4 sm:p-5">
        <ProgressSummary progress={progress} projectName={project.name} />
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--ui-border)] pt-4 sm:gap-6">
          <Metric label={t("tasks")} value={t("openAndCompleted", { open: progress.openTaskCount, completed: progress.completedTaskCount })} />
          <Metric danger={progress.overdueTaskCount > 0} label={projectMessages("overdueCount", { count: progress.overdueTaskCount })} value={progress.overdueTaskCount > 0 ? t("overdueTasks", { count: progress.overdueTaskCount }) : common("notAvailable")} />
        </div>
      </div>
      <div className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4 sm:p-5 lg:border-t-0 lg:border-l">
        <DeadlineSummary locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} projectDueDate={project.due_date} />
        {health.reason && !isArchived ? <p className="mt-4 border-t border-[var(--ui-border)] pt-3 text-sm font-medium text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
      </div>
    </div>

    <dl className="grid border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-sm sm:grid-cols-3 sm:divide-x sm:divide-[var(--ui-border)]">
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
  if (progress.progressPercent === null) return <Metric label={t("progress")} value={t("noTasks")} />;
  const markerOffset = progress.progressPercent === 100 ? "calc(100% - 0.375rem)" : `${progress.progressPercent}%`;
  return <div><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("progress")}</p><p className="ui-numeric mt-1 text-xs text-[var(--ui-text-muted)]">{t("completedCount", { count: progress.completedTaskCount })} · {t("openCount", { count: progress.openTaskCount })}{progress.overdueTaskCount > 0 ? ` · ${t("overdueCount", { count: progress.overdueTaskCount })}` : ""}</p></div><span className="ui-numeric text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{progress.progressPercent}%</span></div><div className="relative mt-4 h-3 min-w-0" role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-progress-track)]" /><div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} />{progress.progressPercent > 0 ? <span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)]" style={{ left: markerOffset }} /> : null}</div></div>;
}

function DeadlineSummary({ locale, nextTaskDueDate, projectDueDate }: { locale: string; nextTaskDueDate: string | null; projectDueDate: string | null }) {
  const t = useTranslations("Workspace");
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><Metric label={t("projectDeadline")} value={projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")} /><Metric label={t("nextTaskDue")} value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")} /></div>;
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric mt-1 font-medium ${danger ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-4 py-3 sm:px-5"><dt className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 break-words font-medium text-[var(--ui-text)]">{value}</dd></div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function LifecycleStatus({ label, status }: { label: string; status: string }) {
  const textClassName = status === "active" ? "text-[var(--ui-success-text)]" : status === "paused" ? "text-[var(--ui-info-text)]" : status === "completed" ? "text-[var(--ui-violet-text)]" : "text-[var(--ui-text-muted)]";
  return <span className={`flex items-center gap-1.5 text-xs font-semibold ${textClassName}`}><LifecycleDot label={label} status={status} />{label}</span>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
