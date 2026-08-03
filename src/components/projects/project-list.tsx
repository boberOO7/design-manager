import Link from "next/link";
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle, getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { getProjectHealthLabel } from "@/lib/project-progress";
import { getProjectHref, getProjectProgressLabel, type PresentedProject } from "@/lib/project-list-presentation";
import { formatDateOnly } from "@/lib/utils";
import type { AccessibleProjectWithTasks } from "@/data/queries/project-progress";

type ProjectItem = PresentedProject<AccessibleProjectWithTasks>;

export function ProjectList({ projects }: { projects: readonly ProjectItem[] }) {
  return <>
    <div className="hidden xl:block">
      <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <div className="grid grid-cols-[minmax(14rem,1.55fr)_minmax(13rem,1fr)_minmax(10rem,0.85fr)_minmax(12rem,1fr)_auto] gap-4 border-b border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-4 py-2 text-xs font-medium text-[var(--ui-text-muted)]"><span>Project</span><span>Health & lifecycle</span><span>Progress</span><span>Deadline context</span><span>Open</span></div>
        <ul className="divide-y divide-[var(--ui-border)]">{projects.map((project) => <ProjectDesktopRow key={project.id} project={project} />)}</ul>
      </div>
    </div>
    <ul className="grid gap-3 sm:grid-cols-2 xl:hidden">{projects.map((project) => <ProjectMobileCard key={project.id} project={project} />)}</ul>
  </>;
}

function ProjectDesktopRow({ project }: { project: ProjectItem }) {
  const health = getProjectHealthBadgeStyle(project.health);
  const lifecycle = getProjectLifecycleBadgeStyle(project.status);
  const priority = getPriorityBadgeStyle(project.priority);
  return <li><Link href={getProjectHref(project.id)} className="grid min-h-24 grid-cols-[minmax(14rem,1.55fr)_minmax(13rem,1fr)_minmax(10rem,0.85fr)_minmax(12rem,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]"><ProjectIdentity project={project} /><div className="flex flex-wrap gap-1.5"><Badge className={health.className} label={getProjectHealthLabel(project.health)} /><Badge className={lifecycle.className} label={lifecycle.label} /><Badge className={priority.className} label={priority.label} /></div><ProjectProgress project={project} compact /><ProjectDeadlines project={project} /><span className="ui-numeric text-sm font-medium text-[var(--ui-text-secondary)]">{project.progress.openTaskCount} open<span className="sr-only"> tasks</span></span></Link></li>;
}

function ProjectMobileCard({ project }: { project: ProjectItem }) {
  const health = getProjectHealthBadgeStyle(project.health);
  const lifecycle = getProjectLifecycleBadgeStyle(project.status);
  const priority = getPriorityBadgeStyle(project.priority);
  return <li><Link href={getProjectHref(project.id)} className="block min-h-44 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition-colors hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><div className="flex items-start justify-between gap-3"><ProjectIdentity project={project} /><span className="shrink-0 text-xs font-medium text-[var(--ui-text-secondary)]">Open project</span></div><div className="mt-3 flex flex-wrap gap-1.5"><Badge className={health.className} label={getProjectHealthLabel(project.health)} /><Badge className={lifecycle.className} label={lifecycle.label} /><Badge className={priority.className} label={priority.label} /></div><ProjectProgress project={project} /><ProjectDeadlines project={project} /></Link></li>;
}

function ProjectIdentity({ project }: { project: ProjectItem }) {
  return <div className="min-w-0"><p className="break-words font-semibold text-[var(--ui-text)]">{project.name}</p><p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">{project.project_code}{project.client_name ? ` · ${project.client_name}` : ""}</p></div>;
}

function ProjectProgress({ compact = false, project }: { compact?: boolean; project: ProjectItem }) {
  if (project.progress.progressPercent === null) return <p className={compact ? "text-sm font-medium text-[var(--ui-text-muted)]" : "mt-4 text-sm font-medium text-[var(--ui-text-muted)]"}>No tasks yet</p>;
  return <div className={compact ? "min-w-0" : "mt-4"}><div className="flex items-center gap-2"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--ui-progress-track)]" role="progressbar" aria-label={`${project.name} progress: ${getProjectProgressLabel(project.progress)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={project.progress.progressPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${project.progress.progressPercent}%` }} /></div><span className="ui-numeric text-sm font-semibold text-[var(--ui-text)]">{project.progress.progressPercent}%</span></div><p className="ui-numeric mt-1 text-xs text-[var(--ui-text-muted)]">{project.progress.completedTaskCount} completed · {project.progress.openTaskCount} open{project.progress.overdueTaskCount ? ` · ${project.progress.overdueTaskCount} overdue` : ""}</p></div>;
}

function ProjectDeadlines({ project }: { project: ProjectItem }) {
  return <div className="mt-4 space-y-1 text-sm text-[var(--ui-text-muted)] xl:mt-0 xl:text-xs"><p>{project.due_date ? `Project ${formatDateOnly(project.due_date)}` : "No project deadline"}</p><p>{project.progress.nearestOpenTaskDueDate ? `Next task ${formatDateOnly(project.progress.nearestOpenTaskDueDate)}` : "No open task deadline"}</p></div>;
}

function Badge({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
