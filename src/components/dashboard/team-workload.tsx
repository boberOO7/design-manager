"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, ClipboardCheck, Clock3, Flame, ListTodo, Play, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getCurrentStatusAge, isTaskInWorkloadCategory, type TeamWorkloadMember, type WorkloadCategory } from "@/lib/dashboard";
import { formatDate } from "@/lib/utils";
import type { DashboardWorkloadTask } from "@/types/tasks";

const METRICS: Array<{ category: WorkloadCategory; icon: LucideIcon; risk?: boolean; iconClassName?: string }> = [
  { category: "todo", icon: ListTodo },
  { category: "in_progress", icon: Play, iconClassName: "text-[var(--ui-info-text)]" },
  { category: "review", icon: ClipboardCheck, iconClassName: "text-[var(--ui-violet-text)]" },
  { category: "urgent", icon: Flame, risk: true },
  { category: "overdue", icon: CircleAlert, risk: true },
];

function statusKey(status: string) {
  switch (status) {
    case "todo": return "todo";
    case "in_progress": return "inProgress";
    case "internal_review": return "internal_review";
    case "review": return "review";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    default: throw new Error(`Unsupported task status: ${status}`);
  }
}

function metricValue(member: TeamWorkloadMember, category: WorkloadCategory) {
  if (category === "todo") return member.todoCount;
  if (category === "in_progress") return member.inProgressCount;
  if (category === "review") return member.reviewCount;
  if (category === "urgent") return member.urgentCount;
  return member.overdueCount;
}

export function TeamWorkload({ asOf, members, today }: { asOf: string; members: TeamWorkloadMember[]; today: string }) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<WorkloadCategory>("in_progress");
  function categoryLabel(category: WorkloadCategory) {
    if (category === "todo") return t("workloadTodo");
    if (category === "in_progress") return t("workloadInProgress");
    if (category === "review") return t("workloadReview");
    if (category === "urgent") return t("workloadUrgent");
    return t("workloadOverdue");
  }
  function expand(memberId: string, category: WorkloadCategory) {
    setSelectedCategory(category);
    setExpandedMemberId(memberId);
  }
  function toggleMember(memberId: string) {
    if (expandedMemberId === memberId) setExpandedMemberId(null);
    else expand(memberId, "in_progress");
  }

  return <ul className="space-y-1">
    {members.map((member) => {
      const isExpanded = expandedMemberId === member.id;
      const tasks = member.tasks.filter((task) => isTaskInWorkloadCategory(task, selectedCategory, today));
      return <li key={member.id} className="rounded-[calc(var(--ui-radius-panel)-0.125rem)]">
        <div className="relative grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <button type="button" aria-expanded={isExpanded} aria-label={member.full_name} onClick={() => toggleMember(member.id)} className="absolute inset-0 cursor-pointer rounded-[calc(var(--ui-radius-panel)-0.125rem)] transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]" />
          <div className="pointer-events-none relative flex min-w-0 items-center gap-2.5">
            <span className="rounded-full ring-2 ring-[var(--ui-surface)] shadow-sm"><UserAvatar imageUrl={member.avatar_url} name={member.full_name} size="boardCard" decorative /></span>
            <div className="min-w-0">
              <b className="block truncate">{member.full_name}</b>
              <small className="block text-[var(--ui-text-muted)]">{member.job_title}</small>
            </div>
          </div>
          <span className="pointer-events-none relative flex flex-wrap items-center gap-x-1 gap-y-1 text-xs sm:justify-end">
            {METRICS.map((metric) => {
              const value = metricValue(member, metric.category);
              const label = categoryLabel(metric.category);
              const activeRisk = metric.risk && value > 0;
              const content = <><metric.icon aria-hidden="true" className={`size-3.5 ${activeRisk ? "text-[var(--ui-danger-text)]" : metric.iconClassName ?? ""}`} /><span className={`ui-numeric font-semibold ${activeRisk ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]"}`}>{value}</span><span>{label}</span></>;
              return value > 0
                ? <button key={metric.category} type="button" onClick={() => expand(member.id, metric.category)} aria-label={t("openWorkloadTasks", { count: value, name: member.full_name, category: label })} className={`pointer-events-auto inline-flex min-h-9 items-center gap-1 whitespace-nowrap px-1.5 text-left transition-colors duration-200 hover:text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:text-[var(--ui-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)] ${activeRisk ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}`}>{content}</button>
                : <span key={metric.category} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap px-1.5 text-[var(--ui-text-muted)]">{content}</span>;
            })}
          </span>
        </div>
        <div aria-hidden={!isExpanded} inert={!isExpanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="border-t border-[var(--ui-border)] px-3 pb-2 pt-2.5">
              <p className="mb-2 text-xs font-medium text-[var(--ui-text-secondary)]">{categoryLabel(selectedCategory)} · {tasks.length}</p>
              <ul className="space-y-1">{tasks.map((task) => <InlineTask key={task.id} asOf={asOf} locale={locale} task={task} today={today} />)}</ul>
            </div>
          </div>
        </div>
      </li>;
    })}
  </ul>;
}

function InlineTask({ asOf, locale, task, today }: { asOf: string; locale: string; task: DashboardWorkloadTask; today: string }) {
  const t = useTranslations("Dashboard");
  const status = useTranslations("Status");
  const age = formatStatusAge(task.currentStatusEnteredAt, asOf, t);
  const overdue = task.due_date !== null && task.due_date < today;
  return <li><Link href={`/projects/${task.project_id}?task=${task.id}`} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--ui-radius-control)] px-2.5 py-2 transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
    <span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--ui-text)]">{task.title}</span><span className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{task.project.name}</span></span>
    <span className="flex shrink-0 flex-col items-end gap-1 text-xs"><span className={`inline-flex items-center gap-1 font-medium ${statusMetadataClass(task.status)}`}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{status(statusKey(task.status))}</span>{age ? <span className="inline-flex items-center gap-1 text-[var(--ui-text-muted)]"><Clock3 className="size-3" aria-hidden="true" />{t("statusAgeInStatus", { duration: age })}</span> : null}{task.due_date ? <time dateTime={task.due_date} className={overdue ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}>{overdue ? `${t("overdue")} · ${formatDate(task.due_date, locale)}` : t("dueDate", { date: formatDate(task.due_date, locale) })}</time> : null}</span>
  </Link></li>;
}

function statusMetadataClass(status: DashboardWorkloadTask["status"]) {
  if (status === "in_progress" || status === "internal_review") return "text-[var(--ui-info-text)]";
  if (status === "review") return "text-[var(--ui-violet-text)]";
  if (status === "completed") return "text-[var(--ui-success-text)]";
  if (status === "cancelled") return "text-[var(--ui-text-muted)]";
  return "text-[var(--ui-text-secondary)]";
}

function formatStatusAge(enteredAt: string | null, asOf: string, t: ReturnType<typeof useTranslations<"Dashboard">>) {
  const age = getCurrentStatusAge(enteredAt, asOf);
  if (!age) return null;
  if (age.unit === "underHour") return t("statusAgeUnderHour");
  return t(age.unit === "hours" ? "statusAgeHours" : "statusAgeDays", { count: age.value });
}
