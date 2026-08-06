"use client";

import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
  const projectMessages = useTranslations("Projects");
  const projectTypes = useTranslations("ProjectTypes");
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
          <h1 id="project-context-heading" className="break-words text-2xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-3xl">{project.name}</h1>
          <div className="flex flex-wrap gap-1.5"><Badge className={lifecycleStyle.className} label={lifecycleStyle.label} /><Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} />{!isArchived ? <Badge className={healthStyle.className} label={getProjectHealthLabel(health.health)} /> : null}</div>
        </div>
        {metadata ? <p className="mt-1 text-sm font-medium text-[var(--ui-text-secondary)]">{metadata}</p> : null}
      </div>
      {canManage ? <ProjectContextActions archiveAction={archiveAction} isArchived={isArchived} project={project} restoreAction={restoreAction} status={status} updateAction={updateAction} /> : null}
    </div>

    <div className="mt-5 grid gap-3 border-t border-[var(--ui-border)] pt-4 lg:grid-cols-[minmax(15rem,1.35fr)_minmax(11rem,0.9fr)_minmax(11rem,0.9fr)_minmax(12rem,1fr)]">
      <ProgressSummary progress={progress} projectName={project.name} />
      <Metric label={t("tasks")} value={t("openAndCompleted", { open: progress.openTaskCount, completed: progress.completedTaskCount })} />
      <Metric danger={progress.overdueTaskCount > 0} label={projectMessages("overdueCount", { count: progress.overdueTaskCount })} value={progress.overdueTaskCount > 0 ? t("overdueTasks", { count: progress.overdueTaskCount }) : common("notAvailable")} />
      <DeadlineSummary locale={locale} nextTaskDueDate={progress.nearestOpenTaskDueDate} projectDueDate={project.due_date} />
    </div>

    <dl className="mt-4 grid gap-x-4 gap-y-3 border-t border-[var(--ui-border)] pt-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <Metadata label={t("projectType")} value={project.project_type ? (isProjectTypeKey(project.project_type) ? projectTypes(project.project_type) : project.project_type) : common("notAvailable")} />
      <Metadata label={t("city")} value={[project.city, getCountryName(project.country_code, locale)].filter(Boolean).join(", ")} />
      <Metadata label={t("totalArea")} value={`${formatNumber(project.total_area_m2, locale)} m²`} />
      <Metadata label={t("startDate")} value={formatDateOnly(project.start_date, locale)} />
    </dl>

    <ProjectProgressSettings canManage={canManage} isReadOnly={isArchived || status === "completed"} project={project} tasks={tasks} />
    {health.reason && !isArchived ? <p className="mt-3 text-sm font-medium text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
  </section>;
}

function ProjectContextActions({ archiveAction, isArchived, project, restoreAction, status, updateAction }: { archiveAction: (formData: FormData) => Promise<void>; isArchived: boolean; project: ProjectContextProject; restoreAction: (formData: FormData) => Promise<void>; status: string; updateAction: ProjectFormAction }) {
  const t = useTranslations("ProjectWorkspace");
  return <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{isArchived ? <ProjectStatusAction action={restoreAction} label={t("restore")} pendingLabel={t("restoring")} /> : <><ProjectLifecycleControls projectId={project.id} />{status !== "completed" && isProjectPriority(project.priority) ? <ProjectEditModal action={updateAction} projectName={project.name} defaultValues={{ name: project.name, project_type: project.project_type ?? undefined, country_code: project.country_code, city: project.city ?? undefined, client_name: project.client_name ?? undefined, description: project.description ?? undefined, total_area_m2: project.total_area_m2, priority: project.priority, start_date: project.start_date, due_date: project.due_date ?? undefined }} /> : null}<details className="relative"><summary aria-label={t("moreActions")} className="flex size-8 cursor-pointer list-none items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></summary><div role="menu" className="absolute right-0 z-20 mt-2 w-36 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><ProjectStatusAction action={archiveAction} confirmMessage={t("archiveConfirm", { name: project.name })} label={t("archive")} menuItem pendingLabel={t("archiving")} /></div></details></>}</div>;
}

function ProgressSummary({ progress, projectName }: { progress: ReturnType<typeof calculateProjectProgress>; projectName: string }) {
  const t = useTranslations("Projects");
  if (progress.progressPercent === null) return <Metric label={t("progress")} value={t("noTasks")} />;
  return <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-3 py-2.5"><div className="flex items-baseline justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-text-muted)]">{t("progress")}</p><span className="ui-numeric text-lg font-semibold text-[var(--ui-text)]">{progress.progressPercent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ui-progress-track)]" role="progressbar" aria-label={t("progressAria", { name: projectName, progress: progress.progressPercent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} /></div><p className="ui-numeric mt-1.5 text-xs text-[var(--ui-text-secondary)]">{t("completedCount", { count: progress.completedTaskCount })} · {t("openCount", { count: progress.openTaskCount })}</p></div>;
}

function DeadlineSummary({ locale, nextTaskDueDate, projectDueDate }: { locale: string; nextTaskDueDate: string | null; projectDueDate: string | null }) {
  const t = useTranslations("Workspace");
  return <div className="grid gap-2"><Metric label={t("projectDeadline")} value={projectDueDate ? formatDateOnly(projectDueDate, locale) : t("noDeadline")} /><Metric label={t("nextTaskDue")} value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate, locale) : t("noOpenDueDate")} /></div>;
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric mt-1 font-medium ${danger ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 truncate font-medium text-[var(--ui-text)]" title={value}>{value}</dd></div>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
