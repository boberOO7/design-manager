"use client";

import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle, getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
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
  const lifecycleStyle = getProjectLifecycleBadgeStyle(isArchived ? "archived" : status);
  const healthStyle = getProjectHealthBadgeStyle(health.health);
  const priorityStyle = getPriorityBadgeStyle(project.priority);
  const metadata = [project.client_name, project.project_code].filter(Boolean).join(" · ");

  return <section aria-labelledby="project-context-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-panel)] sm:p-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0">
        <Link href="/projects" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToProjects")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 id="project-context-heading" className="flex items-center gap-2 break-words text-2xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-3xl"><LifecycleDot label={statusMessages(isArchived ? "archived" : status)} status={isArchived ? "archived" : status} />{project.name}</h1>
          <div className="flex flex-wrap gap-1.5"><Badge className={lifecycleStyle.className} label={lifecycleStyle.label} /><Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} />{!isArchived ? <Badge className={healthStyle.className} label={getProjectHealthLabel(health.health)} /> : null}</div>
        </div>
        {metadata ? <p className="mt-1 text-sm font-medium text-[var(--ui-text-secondary)]">{metadata}</p> : null}
      </div>
      {canManage ? <ProjectContextActions archiveAction={archiveAction} isArchived={isArchived} project={project} restoreAction={restoreAction} status={status} tasks={tasks} updateAction={updateAction} /> : null}
    </div>

    <div className="mt-5 grid gap-x-6 gap-y-4 border-t border-[var(--ui-border)] pt-4 lg:grid-cols-[minmax(14rem,1.2fr)_minmax(11rem,0.9fr)_minmax(10rem,0.75fr)_minmax(12rem,1fr)]">
      <ProgressSummary progress={progress} projectName={project.name} />
      <Metric label={t("tasks")} value={t("openAndCompleted", { open: progress.openTaskCount, completed: progress.completedTaskCount })} />
      <Metric danger={progress.overdueTaskCount > 0} label={projectMessages("overdueCount", { count: progress.overdueTaskCount })} value={progress.overdueTaskCount > 0 ? t("overdueTasks", { count: progress.overdueTaskCount }) : common("notAvailable")} />
      <DeadlineSummary locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} projectDueDate={project.due_date} />
    </div>

    <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-[var(--ui-border)] pt-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
      <Metadata label={t("projectType")} value={project.project_type ? (isProjectTypeKey(project.project_type) ? projectTypes(project.project_type) : project.project_type) : common("notAvailable")} />
      <Metadata label={form("country")} value={getCountryName(project.country_code, locale)} />
      <Metadata label={t("city")} value={project.city ?? common("notAvailable")} />
      <Metadata label={t("totalArea")} value={`${formatNumber(project.total_area_m2, locale)} m²`} />
      <Metadata label={t("startDate")} value={formatDateOnly(project.start_date, locale)} />
    </dl>
    {health.reason && !isArchived ? <p className="mt-3 text-sm font-medium text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
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
  return <div><div className="flex items-center gap-3"><p className="text-xs font-medium text-[var(--ui-text-muted)]">{t("progress")}</p><div className="relative h-3 min-w-0 flex-1" role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-progress-track)]" /><div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} />{progress.progressPercent > 0 ? <span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)]" style={{ left: markerOffset }} /> : null}</div><span className="ui-numeric min-w-10 text-right text-base font-semibold text-[var(--ui-text)]">{progress.progressPercent}%</span></div><p className="ui-numeric mt-1.5 text-xs leading-5 text-[var(--ui-text-muted)]">{t("completedCount", { count: progress.completedTaskCount })} · {t("openCount", { count: progress.openTaskCount })}{progress.overdueTaskCount > 0 ? ` · ${t("overdueCount", { count: progress.overdueTaskCount })}` : ""}</p></div>;
}

function DeadlineSummary({ locale, nextTaskDueDate, projectDueDate }: { locale: string; nextTaskDueDate: string | null; projectDueDate: string | null }) {
  const t = useTranslations("Workspace");
  return <div className="grid gap-2"><Metric label={t("projectDeadline")} value={projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")} /><Metric label={t("nextTaskDue")} value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")} /></div>;
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric mt-1 font-medium ${danger ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 break-words font-medium text-[var(--ui-text)]">{value}</dd></div>;
}

function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <span role="img" aria-label={label} title={label} className={`size-2.5 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
