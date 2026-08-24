import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ProjectActivity } from "@/data/queries/project-activity";
import { formatRelativeTime, getActivityChange, getActivityMemberId, groupActivityByLocalDate, isUuid, type ActivityChangeDetails } from "@/lib/project-activity";

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export async function ProjectActivitySection({ activity, projectId }: { activity: ProjectActivity[]; projectId: string }) {
  const [t, locale] = await Promise.all([getTranslations("ProjectWorkspace"), getLocale()]);
  if (activity.length === 0) return <section className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-6 text-center"><h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("noActivity")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ui-text-muted)]">{t("activityPending")}</p></section>;
  return <section aria-labelledby="project-activity-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]"><div className="border-b border-[var(--ui-border)] px-4 py-4 sm:px-5"><h2 id="project-activity-heading" className="text-lg font-semibold text-[var(--ui-text)]">{t("activity")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("activityDescription")}</p></div><div className="divide-y divide-[var(--ui-border)]">{groupActivityByLocalDate(activity, locale).map((group) => <section key={group.date} aria-label={group.date} className="px-4 py-4 sm:px-5"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{group.date}</h3><ol className="space-y-3">{group.items.map((item) => <ActivityRow key={item.id} activity={item} locale={locale} projectId={projectId} />)}</ol></section>)}</div></section>;
}

async function ActivityRow({ activity, locale, projectId }: { activity: ProjectActivity; locale: string; projectId: string }) {
  const [t, statusT, priorityT, tasksT, teamT] = await Promise.all([getTranslations("ProjectWorkspace"), getTranslations("Status"), getTranslations("Priority"), getTranslations("Tasks"), getTranslations("Team")]);
  const change = getActivityChange(activity.changes);
  const taskLink = activity.entity_type === "task" && activity.entity_id ? `/projects/${projectId}?task=${activity.entity_id}` : null;
  const taskTitle = activity.task?.title ?? t("notAvailable");
  const memberName = (value: string) => activity.memberNames[value] ?? teamT("former");
  const activityMemberId = getActivityMemberId(activity.changes);
  const detail = change ? formatChange(change, locale, { statusT, priorityT, tasksT, t, memberName }) : (activityMemberId ? memberName(activityMemberId) : null);
  const avatarStyle = activity.actor?.avatar_url ? { backgroundImage: `url("${activity.actor.avatar_url}")` } : undefined;
  const headline = getHeadline(activity.action_type, change?.field, activity.entity_type, taskTitle, locale, t);
  return <li className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"><div style={avatarStyle} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] bg-cover bg-center text-xs font-semibold text-[var(--ui-text-secondary)]" aria-hidden="true">{activity.actor?.avatar_url ? null : initials(activity.actor?.full_name ?? t("system"))}</div><div className="min-w-0 flex-1"><p className="text-sm leading-5 text-[var(--ui-text-secondary)]"><span className="font-semibold text-[var(--ui-text)]">{activity.actor?.full_name ?? t("system")}</span> {taskLink ? <Link href={taskLink} className="font-medium text-[var(--ui-text-secondary)] underline decoration-[var(--ui-border-strong)] underline-offset-2 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{headline}</Link> : headline}</p>{detail ? <p className="mt-1 break-words text-xs text-[var(--ui-text-muted)]">{detail}</p> : null}</div><time dateTime={activity.created_at} title={new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(activity.created_at))} className="shrink-0 text-xs tabular-nums text-[var(--ui-text-muted)]">{formatRelativeTime(activity.created_at, new Date(), locale)}</time></li>;
}

type ActivityTranslations = { statusT: Awaited<ReturnType<typeof getTranslations>>; priorityT: Awaited<ReturnType<typeof getTranslations>>; tasksT: Awaited<ReturnType<typeof getTranslations>>; t: Awaited<ReturnType<typeof getTranslations>>; memberName: (value: string) => string };

function getHeadline(actionType: string, field: string | undefined, entityType: string, taskTitle: string, locale: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (entityType === "task") {
    const action = actionType === "task_created" ? t("createdTask") : field === "status" ? t("changedTaskStatus") : field === "assignee_id" ? locale === "uk" ? "змінив(-ла) виконавця завдання" : "changed the assignee of task" : field === "due_date" ? locale === "uk" ? "змінив(-ла) дедлайн завдання" : "changed the due date of task" : t("updatedTask");
    return `${action} “${taskTitle}”`;
  }
  const summaryKey = ({ project_archived: "archivedProject", project_restored: "restoredProject", project_member_added: "addedMember", project_member_removed: "removedMember", project_lifecycle_changed: "changedLifecycle" } as Record<string, string>)[actionType] ?? "updatedProject";
  return t(summaryKey);
}

function formatChange(change: ActivityChangeDetails, locale: string, { statusT, priorityT, tasksT, t, memberName }: ActivityTranslations) {
  const formatValue = (value: ActivityChangeDetails["from"]) => {
    if (change.field === "assignee_id") return value === null ? tasksT("unassigned") : typeof value === "string" ? memberName(value) : t("unknownMember");
    if (change.field === "status" && typeof value === "string") return statusT(value === "in_progress" ? "inProgress" : value);
    if (change.field === "priority" && typeof value === "string") return priorityT(value);
    if (change.field === "due_date" && typeof value === "string") return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${value}T00:00:00`));
    if (value === null) return t("noDate");
    if (typeof value === "boolean") return value ? t("active") : t("inactive");
    if (typeof value === "string" && isUuid(value)) return memberName(value);
    return String(value);
  };
  return `${formatValue(change.from)} → ${formatValue(change.to)}`;
}
