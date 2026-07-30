"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { calculateProjectProgress, getProjectHealth, getProjectHealthLabel, isProjectProgressMethod } from "@/lib/project-progress";
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle, getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { getTaskPriorityLabel } from "@/lib/tasks";
import { formatDateOnly } from "@/lib/utils";
import type { ProjectTask } from "@/types/tasks";

export type ProjectContextProject = {
  id: string;
  name: string;
  project_code: string | null;
  client_name: string | null;
  due_date: string | null;
  priority: string;
  progress_method: string;
  total_area_m2: number;
};

export function ProjectContextBand({ archiveAction, canManage, isArchived, project, restoreAction, tasks }: {
  archiveAction: (formData: FormData) => Promise<void>;
  canManage: boolean;
  isArchived: boolean;
  project: ProjectContextProject;
  restoreAction: (formData: FormData) => Promise<void>;
  tasks: ProjectTask[];
}) {
  const { status } = useProjectLifecycle();
  const progress = calculateProjectProgress(tasks, undefined, {
    method: isProjectProgressMethod(project.progress_method) ? project.progress_method : "equal",
    designScopeAreaM2: Number(project.total_area_m2),
  });
  const health = getProjectHealth({ projectStatus: status, projectDueDate: project.due_date, progress });
  const lifecycleStyle = getProjectLifecycleBadgeStyle(isArchived ? "archived" : status);
  const healthStyle = getProjectHealthBadgeStyle(health.health);
  const priorityStyle = getPriorityBadgeStyle(project.priority);

  return <section aria-labelledby="project-context-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 shadow-[var(--ui-shadow-panel)] sm:px-5">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0"><Link href="/projects" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">← Projects</Link><div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-2"><h1 id="project-context-heading" className="break-words text-xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-2xl">{project.name}</h1><span className="text-sm font-medium text-[var(--ui-text-muted)]">{[project.project_code, project.client_name].filter(Boolean).join(" · ")}</span></div><div className="mt-2 flex flex-wrap gap-1.5"><Badge className={lifecycleStyle.className} label={lifecycleStyle.label} /><Badge className={priorityStyle.className} label={getTaskPriorityLabel(project.priority)} />{!isArchived ? <Badge className={healthStyle.className} label={getProjectHealthLabel(health.health)} /> : null}</div></div>
      {canManage ? <ProjectContextActions archiveAction={archiveAction} isArchived={isArchived} projectId={project.id} projectName={project.name} restoreAction={restoreAction} status={status} /> : null}
    </div>
    <div className="mt-3 grid gap-x-5 gap-y-3 border-t border-[var(--ui-border)] pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(13rem,1.4fr)_minmax(11rem,1fr)_minmax(10rem,1fr)_minmax(11rem,1fr)]">
      <ProgressSummary projectName={project.name} progress={progress} />
      <Metric label="Tasks" value={`${progress.openTaskCount} open · ${progress.completedTaskCount} completed`} />
      {progress.overdueTaskCount > 0 ? <Metric label="Overdue" value={`${progress.overdueTaskCount} task${progress.overdueTaskCount === 1 ? "" : "s"}`} danger /> : <DeadlineSummary projectDueDate={project.due_date} nextTaskDueDate={progress.nearestOpenTaskDueDate} />}
      {progress.overdueTaskCount > 0 ? <DeadlineSummary projectDueDate={project.due_date} nextTaskDueDate={progress.nearestOpenTaskDueDate} /> : null}
    </div>
    {health.reason && !isArchived ? <p className="mt-3 text-sm font-medium text-[var(--ui-text-secondary)]">{health.reason}</p> : null}
  </section>;
}

function ProjectContextActions({ archiveAction, isArchived, projectId, projectName, restoreAction, status }: { archiveAction: (formData: FormData) => Promise<void>; isArchived: boolean; projectId: string; projectName: string; restoreAction: (formData: FormData) => Promise<void>; status: string }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{isArchived ? <ProjectStatusAction action={restoreAction} label="Restore" pendingLabel="Restoring…" /> : <><ProjectLifecycleControls projectId={projectId} />{status !== "completed" ? <Button asChild size="sm" variant="outline"><Link href={`/projects/${projectId}/edit`}>Edit</Link></Button> : null}<details className="relative"><summary aria-label="More project actions" className="flex size-10 cursor-pointer list-none items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-20 mt-2 w-32 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]"><ProjectStatusAction action={archiveAction} confirmMessage={`Archive ${projectName}? You can restore it later.`} label="Archive" pendingLabel="Archiving…" /></div></details></>}</div>;
}

function ProgressSummary({ progress, projectName }: { progress: ReturnType<typeof calculateProjectProgress>; projectName: string }) {
  if (progress.progressPercent === null) return <Metric label="Progress" value="No tasks yet" />;
  return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">Progress</p><div className="mt-1 flex items-center gap-2"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`${projectName} progress: ${progress.progressPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} /></div><span className="ui-numeric text-sm font-semibold text-[var(--ui-text)]">{progress.progressPercent}%</span></div></div>;
}

function DeadlineSummary({ nextTaskDueDate, projectDueDate }: { nextTaskDueDate: string | null; projectDueDate: string | null }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"><Metric label="Project deadline" value={projectDueDate ? formatDateOnly(projectDueDate) : "No deadline"} /><Metric label="Next task due" value={nextTaskDueDate ? formatDateOnly(nextTaskDueDate) : "No open due date"} /></div>;
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</p><p className={`ui-numeric mt-1 font-medium ${danger ? "text-red-800" : "text-[var(--ui-text)]"}`}>{value}</p></div>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
