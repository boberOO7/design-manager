"use client";

import Link from "next/link";
import { ChevronDown, FolderKanban } from "lucide-react";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LifecycleDot } from "@/components/projects/project-lifecycle-dot";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { Select, SelectItem } from "@/components/ui/select";
import type { MyOfficeAssignment } from "@/data/queries/office-assignments";
import { getMyTasksInbox, type InboxFilters, type InboxItem } from "@/lib/my-tasks-inbox";
import { canWorkOnTaskInProject } from "@/lib/project-lifecycle";
import { getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import { mergeProjectTask } from "@/lib/tasks";
import { formatDateOnly } from "@/lib/utils";
import type { MyTask, ProjectTask } from "@/types/tasks";

const periods: InboxFilters["period"][] = ["all", "overdue", "today", "week"];
const states: InboxFilters["state"][] = ["active", "completed", "all"];

export function MyTasksList({ currentUserId, tasks: initialTasks, assignments, stageNames, today }: { currentUserId: string; tasks: MyTask[]; assignments: MyOfficeAssignment[]; stageNames: Record<string, string>; today: string }) {
  const t = useTranslations("Tasks");
  const status = useTranslations("Status");
  const stages = useTranslations("TaskStages");
  const office = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const [tasks, setTasks] = useState(initialTasks);
  const [filters, setFilters] = useState<InboxFilters>({ period: "all", search: "", project: "all", type: "all", state: "active" });
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const isTaskDrawerOpenRef = useRef(false);
  const groups = getMyTasksInbox(tasks, assignments, filters, today);
  const projects = [...new Map(tasks.filter((task) => task.status !== "cancelled").map((task) => [task.project_id, task.project])).entries()]
    .sort((left, right) => left[1].name.localeCompare(right[1].name));
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;
  const controlClass = "h-9 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";

  function openTaskDrawer(taskId: string) {
    isTaskDrawerOpenRef.current = true;
    setSelectedTaskId(taskId);
    setIsTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    isTaskDrawerOpenRef.current = false;
    setIsTaskDrawerOpen(false);
  }

  function clearExitedTask() {
    if (!isTaskDrawerOpenRef.current) setSelectedTaskId(null);
  }

  function updateTask(updatedTask: ProjectTask) {
    setTasks((currentTasks) => mergeProjectTask(currentTasks, updatedTask));
  }

  function toggle(setter: typeof setCollapsed, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function rowContent(item: InboxItem) {
    const itemStatus = item.kind === "project" ? status(item.task.status === "in_progress" ? "inProgress" : item.task.status) : office(`statuses.${item.assignment.status}`);
    const statusClass = item.kind === "project" ? getTaskStatusBadgeStyle(item.task.status).className : item.assignment.status === "done" ? "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]" : item.assignment.status === "in_progress" ? "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
    return <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-left lg:grid lg:grid-cols-[minmax(0,1fr)_max-content_8rem_10rem]">
      <span className="min-w-0 flex-[1_1_15rem] break-words text-sm font-medium text-[var(--ui-text)]">{item.title}</span>
      <span data-inbox-deadline className={`ui-numeric shrink-0 text-xs lg:justify-self-end ${item.overdue ? "font-semibold text-[var(--ui-danger-text)]" : item.deadline === today ? "font-medium text-[var(--ui-warning-text)]" : "text-[var(--ui-text-muted)]"}`}>
        {item.overdue ? `${t("overdue")} · ` : null}{item.deadline ? formatDateOnly(item.deadline, locale) : t("noDueDate")}
      </span>
      {item.kind === "project" ? <span data-inbox-stage className="min-w-0 truncate text-xs text-[var(--ui-text-muted)]" title={stageNames[`${item.task.project_id}:${item.task.stage}`] ?? stages(item.task.stage)}>{stageNames[`${item.task.project_id}:${item.task.stage}`] ?? stages(item.task.stage)}</span> : <span aria-hidden="true" className="hidden lg:block" />}
      <span data-inbox-status className={`min-w-0 w-fit max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>{itemStatus}</span>
    </span>;
  }

  return <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label={t("inboxFilters")}>
        <div className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="group" aria-label={t("inboxPeriod")}>
          {periods.map((period) => <button key={period} type="button" aria-pressed={filters.period === period} onClick={() => setFilters((current) => ({ ...current, period }))} className={`min-h-9 cursor-pointer rounded-[var(--ui-radius-control)] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${filters.period === period ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"}`}>{t(`inboxPeriods.${period}`)}</button>)}
        </div>
        <div className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="group" aria-label={t("inboxState")}>
          {states.map((state) => <button key={state} type="button" aria-pressed={filters.state === state} onClick={() => setFilters((current) => ({ ...current, state }))} className={`min-h-9 cursor-pointer rounded-[var(--ui-radius-control)] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${filters.state === state ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"}`}>{t(`inboxStates.${state}`)}</button>)}
        </div>
        <input type="search" aria-label={t("inboxSearch")} placeholder={t("inboxSearch")} value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} className={`${controlClass} min-w-40 flex-1 sm:max-w-64`} />
        <Select aria-label={t("inboxProject")} value={filters.project} onValueChange={(project) => setFilters((current) => ({ ...current, project }))} size="compact" width="content" className="h-9 max-w-52 text-sm">
          <SelectItem value="all">{t("inboxAllProjects")}</SelectItem>
          {projects.map(([id, project]) => <SelectItem key={id} value={id}>{project.name}</SelectItem>)}
          {assignments.length ? <SelectItem value="office">{t("inboxOffice")}</SelectItem> : null}
        </Select>
        <Select aria-label={t("inboxType")} value={filters.type} onValueChange={(value) => { if (value === "all" || value === "project" || value === "office") setFilters((current) => ({ ...current, type: value })); }} size="compact" width="content" className="h-9 text-sm">
          <SelectItem value="all">{t("inboxTypes.all")}</SelectItem><SelectItem value="project">{t("inboxTypes.project")}</SelectItem><SelectItem value="office">{t("inboxTypes.office")}</SelectItem>
        </Select>
      </div>
      {groups.length ? <div className="divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)] bg-[var(--ui-surface)]">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          const isExpanded = expanded.has(group.id);
          const visible = isExpanded ? group.items : group.items.slice(0, 5);
          const more = group.items.length - visible.length;
          const name = group.id === "office" ? t("inboxOffice") : group.name;
          return <section key={group.id} aria-label={name} data-inbox-group={group.id}>
            <div className="flex min-h-11 items-center gap-2 bg-[var(--ui-surface-subtle)] px-3 sm:px-4">
              <h2 className="min-w-0 flex-1"><button type="button" aria-expanded={!isCollapsed} aria-label={t("inboxToggleGroup", { name })} onClick={() => toggle(setCollapsed, group.id)} className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
                {group.status ? <LifecycleDot label={status(group.status)} status={group.status} /> : <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--ui-violet-text)]" />}
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{name}</span>
                <span className="ui-numeric rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs text-[var(--ui-text-secondary)]">{group.items.length}</span>
                <ChevronDown className={`ml-auto size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
              </button></h2>
              {group.id !== "office" ? <Link href={`/projects/${group.id}`} aria-label={t("goToProject")} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><FolderKanban className="size-4" aria-hidden="true" /></Link> : null}
            </div>
            {!isCollapsed ? <div className="divide-y divide-[var(--ui-border-subtle)]">
              {visible.map((item) => <div key={`${item.kind}-${item.kind === "project" ? item.task.id : item.assignment.id}`} className="flex items-center gap-1 px-3 hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] sm:px-4">
                {item.kind === "project" ? <><button type="button" aria-label={t("openTask", { name: item.title })} onClick={() => openTaskDrawer(item.task.id)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{rowContent(item)}</button><Link href={`/projects/${item.task.project_id}?task=${item.task.id}`} aria-label={t("goToProject")} onClick={(event) => event.stopPropagation()} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><FolderKanban className="size-4" aria-hidden="true" /></Link></> : <Link href={`/office/assignments?item=${item.assignment.id}`} className="flex min-h-11 min-w-0 flex-1 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{rowContent(item)}</Link>}
              </div>)}
              {more > 0 ? <button type="button" onClick={() => toggle(setExpanded, group.id)} className="min-h-10 w-full cursor-pointer px-4 text-left text-xs font-medium text-[var(--ui-action-primary)] hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("inboxMore", { count: more })}</button> : isExpanded && group.items.length > 5 ? <button type="button" onClick={() => toggle(setExpanded, group.id)} className="min-h-10 w-full cursor-pointer px-4 text-left text-xs font-medium text-[var(--ui-action-primary)] hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("inboxLess")}</button> : null}
            </div> : null}
          </section>;
        })}
      </div> : <p className="py-10 text-center text-sm text-[var(--ui-text-muted)]">{t("inboxEmpty")}</p>}
    </div>
    {selectedTask ? <TaskDetailsDrawer key={selectedTask.id} canManageTasks={false} currentUserId={currentUserId} isProjectReadOnly={!canWorkOnTaskInProject({ projectStatus: selectedTask.project.status, archivedAt: selectedTask.project.archived_at, stage: selectedTask.stage })} members={[]} isOpen={isTaskDrawerOpen} onClose={closeTaskDrawer} onExited={clearExitedTask} onTaskUpdated={updateTask} task={selectedTask} /> : null}
  </>;
}
