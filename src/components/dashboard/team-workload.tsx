"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, ClipboardCheck, Clock3, Flame, ListTodo, Play, Ruler, type LucideIcon } from "lucide-react";
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
  const [selectedCategory, setSelectedCategory] = useState<WorkloadCategory | "area">("in_progress");
  function categoryLabel(category: WorkloadCategory | "area") {
    if (category === "area") return t("workloadArea");
    if (category === "todo") return t("workloadTodo");
    if (category === "in_progress") return t("workloadInProgress");
    if (category === "review") return t("workloadReview");
    if (category === "urgent") return t("workloadUrgent");
    return t("workloadOverdue");
  }
  function expand(memberId: string, category: WorkloadCategory | "area") {
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
      const tasks = member.tasks.filter((task) => selectedCategory === "area" ? task.workloadAreaM2 > 0 : isTaskInWorkloadCategory(task, selectedCategory, today)).sort((left, right) => {
        const overdue = Number(isOverdue(right, today)) - Number(isOverdue(left, today));
        if (overdue) return overdue;
        const priority = priorityRank(left.priority) - priorityRank(right.priority);
        if (priority) return priority;
        const leftEntered = reliableActiveEntry(left, asOf);
        const rightEntered = reliableActiveEntry(right, asOf);
        if (leftEntered && rightEntered) return rightEntered.localeCompare(leftEntered);
        return Number(Boolean(rightEntered)) - Number(Boolean(leftEntered));
      });
      const visibleTasks: DashboardWorkloadTask[] = [];
      const projectGroups = new Map<string, { name: string; tasks: DashboardWorkloadTask[] }>();
      for (const task of tasks) {
        if (visibleTasks.length === 8) break;
        const group = projectGroups.get(task.project_id) ?? { name: task.project.name, tasks: [] };
        if (group.tasks.length === 3) continue;
        group.tasks.push(task);
        projectGroups.set(task.project_id, group);
        visibleTasks.push(task);
      }
      const areaLabel = t("workloadAreaValue", { area: formatArea(member.workloadAreaM2, locale) });
      const areaTitle = `${areaLabel} · ${categoryLabel("area")}`;
      const areaContent = <><Ruler aria-hidden="true" className="size-4" /><span className="ui-numeric tabular-nums">{areaLabel}</span></>;
      return <li key={member.id} className="rounded-[calc(var(--ui-radius-panel)-0.125rem)]">
        <div className="relative grid gap-x-3 gap-y-1.5 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_31.75rem] lg:items-center">
          <button type="button" aria-expanded={isExpanded} aria-label={member.full_name} onClick={() => toggleMember(member.id)} className="absolute inset-0 cursor-pointer rounded-[calc(var(--ui-radius-panel)-0.125rem)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]" />
          <div className="pointer-events-none relative flex min-w-0 items-center gap-2.5">
            <span className="rounded-full ring-2 ring-[var(--ui-surface)] shadow-sm"><UserAvatar imageUrl={member.avatar_url} name={member.full_name} size="boardCard" decorative /></span>
            <div className="min-w-0">
              <b className="block truncate">{member.full_name}</b>
              <small className="block text-[var(--ui-text-muted)]">{member.job_title}</small>
            </div>
          </div>
          <div className="pointer-events-none relative grid grid-cols-[minmax(6rem,1.5fr)_repeat(5,minmax(2.25rem,1fr))] items-center gap-x-1 text-sm lg:grid-cols-[8rem_repeat(5,4.25rem)] lg:gap-x-2">
            {member.workloadAreaM2 > 0
              ? <button type="button" onClick={() => expand(member.id, "area")} title={areaTitle} aria-label={t("openWorkloadArea", { name: member.full_name, area: areaLabel })} className="pointer-events-auto inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ui-radius-control)] font-semibold text-[var(--ui-text)] transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]">{areaContent}</button>
              : <span role="img" title={areaTitle} aria-label={areaTitle} className="pointer-events-auto inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap text-[var(--ui-text-muted)]">{areaContent}</span>}
            {METRICS.map((metric) => {
              const value = metricValue(member, metric.category);
              const label = categoryLabel(metric.category);
              const title = `${label} · ${value}`;
              const activeRisk = metric.risk && value > 0;
              const color = value === 0 ? "text-[var(--ui-text-muted)]" : activeRisk ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]";
              const content = <><metric.icon aria-hidden="true" className={`size-4 ${value > 0 && !activeRisk ? metric.iconClassName ?? "" : ""}`} /><span className="ui-numeric tabular-nums">{value}</span></>;
              return value > 0
                ? <button key={metric.category} type="button" onClick={() => expand(member.id, metric.category)} title={title} aria-label={t("openWorkloadTasks", { count: value, name: member.full_name, category: label })} className={`pointer-events-auto inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--ui-radius-control)] font-semibold transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)] ${color}`}>{content}</button>
                : <span key={metric.category} role="img" title={title} aria-label={title} className={`pointer-events-auto inline-flex min-h-8 items-center justify-center gap-1 ${color}`}>{content}</span>;
            })}
          </div>
        </div>
        <div aria-hidden={!isExpanded} inert={!isExpanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="border-t border-[var(--ui-border)] px-3 pb-2 pt-2.5">
              <p className="mb-2 text-xs font-medium text-[var(--ui-text-secondary)]">{categoryLabel(selectedCategory)} · {tasks.length}</p>
              <div className="space-y-3">{[...projectGroups].map(([projectId, group]) => {
                const projectTasks = tasks.filter((task) => task.project_id === projectId);
                const hiddenCount = projectTasks.length - group.tasks.length;
                return <section key={projectId} aria-label={group.name} className="border-t border-[var(--ui-border)] pt-2 first:border-0 first:pt-0">
                  <h4 className="mb-1 flex items-center justify-between gap-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ui-text-secondary)]"><span className="truncate">{group.name}</span><span className="ui-numeric shrink-0 text-[var(--ui-text-muted)]">{selectedCategory === "area" ? t("workloadProjectArea", { area: formatArea(projectTasks.reduce((total, task) => total + task.workloadAreaM2, 0), locale) }) : t("workloadProjectTaskCount", { count: projectTasks.length })}</span></h4>
                  <ul className="space-y-1">{group.tasks.map((task) => <InlineTask key={task.id} asOf={asOf} locale={locale} task={task} today={today} showArea={selectedCategory === "area"} />)}</ul>
                  {hiddenCount > 0 ? <p className="px-2 pt-1"><Link href={`/projects/${projectId}`} className="text-xs font-medium text-[var(--ui-info-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]">{t("showMoreWorkloadTasks", { count: hiddenCount })}</Link></p> : null}
                </section>;
              })}</div>
              {tasks.length > visibleTasks.length ? <p className="mt-2 text-right text-xs text-[var(--ui-text-muted)]">{t("showingWorkloadTasks", { shown: visibleTasks.length, total: tasks.length })}</p> : null}
            </div>
          </div>
        </div>
      </li>;
    })}
  </ul>;
}

function isOverdue(task: DashboardWorkloadTask, today: string) {
  return task.due_date !== null && task.due_date < today;
}

function priorityRank(priority: DashboardWorkloadTask["priority"]) {
  return priority === "urgent" ? 0 : priority === "high" ? 1 : 2;
}

function reliableActiveEntry(task: DashboardWorkloadTask, asOf: string) {
  const enteredAt = task.currentStatusEnteredAt;
  return task.status !== "completed" && task.status !== "cancelled" && enteredAt && Number.isFinite(Date.parse(enteredAt)) && Date.parse(enteredAt) <= Date.parse(asOf) ? enteredAt : null;
}

function InlineTask({ asOf, locale, task, today, showArea }: { asOf: string; locale: string; task: DashboardWorkloadTask; today: string; showArea: boolean }) {
  const t = useTranslations("Dashboard");
  const status = useTranslations("Status");
  const age = formatStatusAge(task.currentStatusEnteredAt, asOf, t);
  const overdue = task.due_date !== null && task.due_date < today;
  return <li><Link href={`/projects/${task.project_id}?task=${task.id}`} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--ui-radius-control)] px-2.5 py-2 transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
    <span className="min-w-0 truncate text-sm font-medium text-[var(--ui-text)]">{task.title}</span>
    <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">{showArea ? <span className="ui-numeric font-semibold text-[var(--ui-text-secondary)]">{t("workloadTaskArea", { area: formatArea(task.workloadAreaM2, locale) })}</span> : null}{showArea ? <span className="text-[var(--ui-text-muted)]">{status(task.status === "in_progress" ? "inProgress" : task.status)}</span> : null}{age ? <span className="inline-flex items-center gap-1 text-[var(--ui-text-muted)]"><Clock3 className="size-3" aria-hidden="true" />{t("statusAgeInStatus", { duration: age })}</span> : null}{task.due_date ? <time dateTime={task.due_date} className={overdue ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]"}>{overdue ? `${t("overdue")} · ${formatDate(task.due_date, locale)}` : t("dueDate", { date: formatDate(task.due_date, locale) })}</time> : null}</span>
  </Link></li>;
}

function formatStatusAge(enteredAt: string | null, asOf: string, t: ReturnType<typeof useTranslations<"Dashboard">>) {
  const age = getCurrentStatusAge(enteredAt, asOf);
  if (!age) return null;
  if (age.unit === "underHour") return t("statusAgeUnderHour");
  return t(age.unit === "hours" ? "statusAgeHours" : "statusAgeDays", { count: age.value });
}

function formatArea(area: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(area);
}
