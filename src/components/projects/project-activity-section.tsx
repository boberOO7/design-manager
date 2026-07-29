import Link from "next/link";
import type { ProjectActivity } from "@/data/queries/project-activity";
import { formatActivityValue, formatRelativeTime, getActivityChangeText, getActivitySummary, groupActivityByLocalDate, isActivityChanges } from "@/lib/project-activity";

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

function actorName(activity: ProjectActivity) { return activity.actor?.full_name ?? "System"; }

export function ProjectActivitySection({ activity, projectId }: { activity: ProjectActivity[]; projectId: string }) {
  if (activity.length === 0) return <section className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-6 text-center"><h2 className="text-lg font-semibold text-[var(--ui-text)]">No activity yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ui-text-muted)]">Activity History starts when this migration is deployed. Future project, task, and team changes will appear here.</p></section>;
  return <section aria-labelledby="project-activity-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]"><div className="border-b border-[var(--ui-border)] px-4 py-4 sm:px-5"><h2 id="project-activity-heading" className="text-lg font-semibold text-[var(--ui-text)]">Activity</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">A permanent project record, newest first.</p></div><div className="divide-y divide-[var(--ui-border)]">{groupActivityByLocalDate(activity).map((group) => <section key={group.date} aria-label={group.date} className="px-4 py-4 sm:px-5"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{group.date}</h3><ol className="space-y-3">{group.items.map((item) => <ActivityRow key={item.id} activity={item} projectId={projectId} />)}</ol></section>)}</div></section>;
}

function ActivityRow({ activity, projectId }: { activity: ProjectActivity; projectId: string }) {
  const change = getActivityChangeText(activity.changes);
  const taskLink = activity.entity_type === "task" && activity.entity_id ? `/projects/${projectId}?task=${activity.entity_id}` : null;
  const memberId = isActivityChanges(activity.changes) && typeof activity.changes.member_id === "string" ? activity.changes.member_id : null;
  const detail = change ?? (memberId ? `Member ${formatActivityValue(memberId)}` : null);
  const avatarStyle = activity.actor?.avatar_url ? { backgroundImage: `url("${activity.actor.avatar_url}")` } : undefined;
  return <li className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"><div style={avatarStyle} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] bg-cover bg-center text-xs font-semibold text-[var(--ui-text-secondary)]" aria-hidden="true">{activity.actor?.avatar_url ? null : initials(actorName(activity))}</div><div className="min-w-0 flex-1"><p className="text-sm leading-5 text-[var(--ui-text-secondary)]"><span className="font-semibold text-[var(--ui-text)]">{actorName(activity)}</span> {taskLink ? <Link href={taskLink} className="font-medium text-[var(--ui-text-secondary)] underline decoration-[var(--ui-border-strong)] underline-offset-2 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{getActivitySummary(activity.action_type, activity.changes)}</Link> : getActivitySummary(activity.action_type, activity.changes)}</p>{detail ? <p className="mt-1 break-words text-xs text-[var(--ui-text-muted)]">{detail}</p> : null}</div><time dateTime={activity.created_at} title={new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(activity.created_at))} className="shrink-0 text-xs tabular-nums text-[var(--ui-text-muted)]">{formatRelativeTime(activity.created_at)}</time></li>;
}
