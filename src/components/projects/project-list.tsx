"use client";

import Link from "next/link";
import { LifecycleDot } from "./project-lifecycle-dot";
import { useSearchParams } from "next/navigation";
import { ProjectListControls, resetProjectListFilters } from "./project-list-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { getPriorityBadgeStyle, getProjectHealthBadgeStyle } from "@/lib/semantic-styles";
import { filterAndSortProjects, getProjectListEmptyState, getProjectListFilters, hasActiveProjectListFilters, getProjectHref, getProjectProgressLabel, type PresentedProject } from "@/lib/project-list-presentation";
import { formatDateOnly } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AccessibleProjectWithTasks } from "@/data/queries/project-progress";

type ProjectItem = Pick<PresentedProject<AccessibleProjectWithTasks>, "id" | "name" | "client_name" | "status" | "priority" | "due_date" | "participants" | "progress" | "health" | "healthReason">;

const healthKeys = { on_track: "healthOnTrack", needs_attention: "healthNeedsAttention", deadline_soon: "healthDeadlineSoon", overdue: "healthOverdue", completed: "healthCompleted" } as const;

const desktopGridClassName = "grid-cols-[minmax(16rem,3.25fr)_minmax(10.5rem,1.1fr)_minmax(17rem,17.5rem)_minmax(8rem,1.35fr)_minmax(4.5rem,0.95fr)_minmax(6.5rem,1fr)]";
const deadlineContentClassName = "justify-self-center text-center";

export function ProjectListWorkspace({ projects }: { projects: readonly ProjectItem[] }) {
  const t = useTranslations("Projects");
  const params = useSearchParams();
  const filters = getProjectListFilters(Object.fromEntries(
    ["lifecycle", "health", "priority", "sort"].map((key) => [key, params.getAll(key).length > 1 ? params.getAll(key) : params.get(key) ?? undefined]),
  ));
  const visibleProjects = filterAndSortProjects(projects, filters);
  const emptyState = getProjectListEmptyState(filters);
  return <>
    <ProjectListControls filters={filters} />
    {visibleProjects.length ? <ProjectList filters={filters} projects={visibleProjects} /> : <EmptyState title={t(emptyState.titleKey)} description={t("emptyFilteredDescription")} action={emptyState.canReset ? <Button variant="outline" onClick={resetProjectListFilters}>{t("resetFilters")}</Button> : undefined} />}
    {hasActiveProjectListFilters(filters) ? <p className="text-sm text-[var(--ui-text-muted)]">Showing {visibleProjects.length} of {projects.length} accessible projects.</p> : null}
  </>;
}

export function ProjectList({ filters, projects }: { filters: ReturnType<typeof getProjectListFilters>; projects: readonly ProjectItem[] }) {
  const t = useTranslations("Projects");
  return <div className="@container"><div className="hidden @min-[70rem]:block"><div className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]"><div className={`grid ${desktopGridClassName} gap-x-4 @min-[80rem]:gap-x-7 border-b border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-4 py-2 text-left text-xs font-medium text-[var(--ui-text-muted)]`}><span>{t("project")}</span><span>{t("participants")}</span><span>{t("progress")}</span><span className={deadlineContentClassName}>{t("deadline")}</span><span className="text-center">{t("open")}</span><span className="text-center">{t("health")}</span></div><ul className="divide-y divide-[var(--ui-border)]">{projects.map((project) => <ProjectDesktopRow filters={filters} key={project.id} project={project} />)}</ul></div></div><ul className="grid gap-3 sm:grid-cols-2 @min-[70rem]:hidden">{projects.map((project) => <ProjectMobileCard filters={filters} key={project.id} project={project} />)}</ul></div>;
}

function ProjectDesktopRow({ filters, project }: { filters: ReturnType<typeof getProjectListFilters>; project: ProjectItem }) { const t = useTranslations("Projects"); const paused = project.status === "paused"; return <li><Link href={getProjectHref(project.id, filters)} className={`grid min-h-24 ${desktopGridClassName} items-center gap-x-4 @min-[80rem]:gap-x-7 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]`}><ProjectIdentity project={project} /><ProjectParticipants participants={project.participants} /><div className="min-w-0"><ProjectProgress project={project} compact muted={paused} /></div><div className={`min-w-0 ${deadlineContentClassName}`}><ProjectDeadlines project={project} compact muted={paused} /></div><span className={`ui-numeric justify-self-center text-center text-sm font-medium ${paused ? "text-[var(--ui-text-muted)]" : "text-[var(--ui-text-secondary)]"}`}>{t("openCount", { count: project.progress.openTaskCount })}</span><ProjectSignals centered project={project} /></Link></li>; }
function ProjectMobileCard({ filters, project }: { filters: ReturnType<typeof getProjectListFilters>; project: ProjectItem }) {
  const t = useTranslations("Projects");
  const paused = project.status === "paused";
  return <li className="min-w-0"><Link href={getProjectHref(project.id, filters)} className="flex h-full min-h-56 flex-col rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition-colors hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
    <ProjectIdentity project={project} />
    <div className="mt-3 flex min-h-10 items-start justify-between gap-3">
      <ProjectSignals project={project} />
      <span className={`shrink-0 text-xs font-medium ${paused ? "text-[var(--ui-text-muted)]" : "text-[var(--ui-text-secondary)]"}`}>{t("openProject")}</span>
    </div>
    <div className="mt-4 min-h-8"><ProjectParticipants participants={project.participants} /></div>
    <div className="mt-auto min-h-16 pt-4"><ProjectProgress project={project} compact muted={paused} /></div>
    <div className="mt-3 border-t border-[var(--ui-border-subtle)] pt-3"><ProjectDeadlines project={project} flush muted={paused} /></div>
  </Link></li>;
}
function ProjectIdentity({ project }: { project: ProjectItem }) { const status = useTranslations("Status"); const t = useTranslations("Projects"); const label = status(project.status); return <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 break-words font-semibold text-[var(--ui-text)]"><LifecycleDot status={project.status} label={label} />{project.name}{project.status === "paused" ? <Badge className="border border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" label={t("pausedBadge")} /> : null}</p>{project.client_name ? <p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">{project.client_name}</p> : null}</div>; }
function ProjectParticipants({ participants }: { participants: ProjectItem["participants"] }) { const t = useTranslations("Projects"); const visibleParticipants = participants.slice(0, 5); const hiddenCount = participants.length - visibleParticipants.length; if (visibleParticipants.length === 0) return <span className="text-sm text-[var(--ui-text-subtle)]" aria-label={t("noParticipants")}>—</span>; return <div className="flex min-w-0 items-center" aria-label={t("participants")}>{visibleParticipants.map((participant, index) => <span className={index === 0 ? "relative shrink-0" : "relative -ml-1.5 shrink-0"} key={participant.id} title={participant.full_name}><UserAvatar className="ring-2 ring-[var(--ui-surface)]" decorative imageUrl={participant.avatar_url} name={participant.full_name} size="projectList" /></span>)}{hiddenCount > 0 ? <span className="-ml-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-surface-muted)] text-[10px] font-semibold text-[var(--ui-text-secondary)]" title={t("moreParticipants", { count: hiddenCount })}>+{hiddenCount}</span> : null}</div>; }
function ProjectSignals({ centered = false, project }: { centered?: boolean; project: ProjectItem }) { const t = useTranslations("Projects"); const priority = useTranslations("Priority"); const healthLabel = t(healthKeys[project.health]); const needsAttention = project.health !== "on_track" && project.health !== "completed"; return <div className={`flex min-w-0 flex-col ${centered ? "justify-self-center items-center text-center" : "items-start text-left"}`}>{needsAttention ? <Badge className={`font-semibold ${getProjectHealthBadgeStyle(project.health).className}`} label={healthLabel} title={project.healthReason ?? healthLabel} /> : null}<PrioritySignal priority={project.priority} label={priority(project.priority)} className={needsAttention ? "mt-1.5" : ""} /></div>; }
function PrioritySignal({ className = "", label, priority }: { className?: string; label: string; priority: string }) { if (priority === "normal" || priority === "low") return <span className={`text-xs font-medium text-[var(--ui-text-muted)] ${className}`}>{label}</span>; return <Badge className={`${getPriorityBadgeStyle(priority).className} ${className}`} label={label} />; }
function ProjectProgress({ compact = false, muted = false, project }: { compact?: boolean; muted?: boolean; project: ProjectItem }) { const t = useTranslations("Projects"); if (project.progress.eligibleTaskCount === 0) return <p className={compact ? "text-sm font-medium text-[var(--ui-text-muted)]" : "mt-4 text-sm font-medium text-[var(--ui-text-muted)]"}>{t("noTasks")}</p>; const label = getProjectProgressLabel(project.progress); const markerOffset = project.progress.progressPercent === 100 ? "calc(100% - 0.375rem)" : `${project.progress.progressPercent}%`; return <div className={compact ? "min-w-0" : "mt-4"}><div className="flex items-center gap-3"><div className="relative h-3 min-w-0 flex-1" role="progressbar" aria-label={t("progressAria", { name: project.name, progress: label })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={project.progress.progressPercent}><div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ui-progress-track)]" /><div className={`absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full ${muted ? "bg-[var(--ui-text-subtle)]" : "bg-[var(--ui-action-primary)]"}`} style={{ width: `${project.progress.progressPercent}%` }} />{project.progress.progressPercent > 0 ? <span aria-hidden="true" className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] ${muted ? "bg-[var(--ui-text-subtle)]" : "bg-[var(--ui-action-primary)]"}`} style={{ left: markerOffset }} /> : null}</div><span className={`ui-numeric min-w-10 text-left text-sm font-semibold ${muted ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-text)]"}`}>{project.progress.progressPercent}%</span></div><p className="ui-numeric mt-1.5 text-xs leading-5 text-[var(--ui-text-muted)]">{t("completedCount", { count: project.progress.completedTaskCount })} · {t("openCount", { count: project.progress.openTaskCount })}{project.progress.overdueTaskCount ? ` · ${t("overdueCount", { count: project.progress.overdueTaskCount })}` : ""}</p></div>; }
function ProjectDeadlines({ compact = false, flush = false, muted = false, project }: { compact?: boolean; flush?: boolean; muted?: boolean; project: ProjectItem }) { const t = useTranslations("Projects"); const locale = useLocale(); return <div className={`${compact ? "text-xs" : flush ? "text-sm" : "mt-4 text-sm"} ${muted ? "text-[var(--ui-text-subtle)]" : "text-[var(--ui-text-muted)]"}`}><p>{project.due_date ? t("projectDeadline", { date: formatDateOnly(project.due_date, locale) }) : "—"}</p></div>; }
function Badge({ className, label, title }: { className: string; label: string; title?: string }) { return <span title={title} className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>; }
