"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loadDashboardTask } from "@/app/(app)/dashboard/task-actions";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { FolderKanban, X } from "lucide-react";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { getEmployeeTasksNeedingAttention, getTodayDate } from "@/lib/dashboard";
import { getBoardTaskProgressSummary } from "@/lib/task-card-presentation";
import { isTaskOverdue } from "@/lib/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { DashboardTaskSummary, ProjectTask } from "@/types/tasks";

export function DashboardTaskList({ currentUserId, tasks, needsAttentionOnly = false, emptyState }: { currentUserId: string; tasks: DashboardTaskSummary[]; needsAttentionOnly?: boolean; emptyState?: { title: string; description: string; linkHref: string; linkLabel: string } }) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const taskT = useTranslations("Tasks");
  const status = useTranslations("Status");
  const priority = useTranslations("Priority");
  const locale = useLocale();
  const [items, setItems] = useState(tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const isTaskDrawerOpenRef = useRef(false);
  const selectedItem = selectedTaskId ? items.find((task) => task.id === selectedTaskId) ?? null : null;
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const detailRequest = useRef(0);

  function openTaskDrawer(taskId: string) {
    isTaskDrawerOpenRef.current = true;
    setSelectedTaskId(taskId);
    setIsTaskDrawerOpen(false);
    setSelectedTask(null);
    setLoadFailed(false);
    const request = ++detailRequest.current;
    const item = items.find((task) => task.id === taskId);
    if (!item) return;
    void loadDashboardTask(taskId, item.project_id).then((task) => {
      if (request !== detailRequest.current || !isTaskDrawerOpenRef.current) return;
      if (task) setSelectedTask(task);
      else setLoadFailed(true);
      setIsTaskDrawerOpen(true);
    }).catch(() => {
      if (request === detailRequest.current && isTaskDrawerOpenRef.current) {
        setLoadFailed(true);
        setIsTaskDrawerOpen(true);
      }
    });
  }

  function closeTaskDrawer() {
    detailRequest.current += 1;
    isTaskDrawerOpenRef.current = false;
    setIsTaskDrawerOpen(false);
  }

  function clearExitedTask() {
    if (!isTaskDrawerOpenRef.current) setSelectedTaskId(null);
    if (!isTaskDrawerOpenRef.current) setSelectedTask(null);
  }

  function updateTask(updatedTask: ProjectTask) {
    setSelectedTask((current) => current?.id === updatedTask.id ? updatedTask : current);
    setItems((current) => {
      const next = current.map((task) => task.id === updatedTask.id ? { ...task, ...updatedTask } : task);
      return needsAttentionOnly ? getEmployeeTasksNeedingAttention(next, getTodayDate()) : next;
    });
  }

  return <>
    <div>
      {items.length === 0 && emptyState ? <EmptyState compact title={emptyState.title} description={emptyState.description} action={<Link href={emptyState.linkHref} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4">{emptyState.linkLabel}</Link>} /> : null}
      {items.length ? <ul className="divide-y divide-[var(--ui-border)]">
      {items.map((task) => {
        const overdue = isTaskOverdue(task);
        const dueToday = task.due_date === getTodayDate();
        const progress = getBoardTaskProgressSummary(task);
        return <li key={task.id} className="relative px-3 py-2.5 sm:px-4">
          <button
            type="button"
            aria-label={`${task.title}. ${t("openTaskDetails")}`}
            onClick={() => openTaskDrawer(task.id)}
            className="absolute inset-0 z-0 cursor-pointer rounded-xl transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] active:bg-[var(--ui-surface-subtle)]"
          />
          <div className="pointer-events-none relative z-10 grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0"><p className="min-h-11 break-words py-2 font-medium leading-5 text-[var(--ui-text)]">{task.title}</p></div>
            <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${getTaskStatusBadgeStyle(task.status).className}`}>{status(task.status === "in_progress" ? "inProgress" : task.status)}</span>
          </div>
          <div className="pointer-events-none relative z-10 -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pr-12 text-xs"><span className="break-words text-[var(--ui-text-muted)]">{task.project.name}</span><span aria-hidden="true" className="text-[var(--ui-text-muted)]">·</span><span className={`rounded-full px-1.5 py-0.5 font-medium ${getPriorityBadgeStyle(task.priority).className}`}>{priority(task.priority)}</span>{progress?.kind === "checklist" ? <><span aria-hidden="true" className="text-[var(--ui-text-muted)]">·</span><span aria-label={taskT("checklistProgress", { completed: progress.completed, total: progress.total })} className="ui-numeric font-medium text-[var(--ui-text-secondary)]">{progress.completed}/{progress.total}</span></> : null}{task.due_date ? <><span aria-hidden="true" className="text-[var(--ui-text-muted)]">·</span><span className={overdue ? "font-medium text-[var(--ui-danger-text)]" : dueToday ? "font-medium text-[var(--ui-warning-text)]" : "text-[var(--ui-text-secondary)]"}>{overdue ? t("overdue") : dueToday ? t("dueToday") : t("dueDate", { date: formatDate(task.due_date, locale) })}</span></> : null}</div>
          <Link href={`/projects/${task.project_id}`} aria-label={taskT("goToProject")} title={taskT("goToProject")} onClick={(event) => event.stopPropagation()} className="absolute bottom-1.5 right-1.5 z-20 inline-flex size-11 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><FolderKanban className="size-4" aria-hidden="true" /></Link>
        </li>;
      })}
      </ul> : null}
    </div>
    {selectedItem && isTaskDrawerOpen && !selectedTask ? <Drawer className="w-full max-w-[34rem]" title={taskT("taskDetails")} isOpen={isTaskDrawerOpen} onClose={closeTaskDrawer} onExited={clearExitedTask}>
      <div className="flex items-center justify-between border-b border-[var(--ui-border)] p-4"><h2 className="font-semibold">{selectedItem.title}</h2><Button aria-label={taskT("closeTaskDetails")} size="sm" variant="ghost" onClick={closeTaskDrawer}><X className="size-4" /></Button></div>
      <p className="p-4 text-sm text-[var(--ui-text-muted)]" role={loadFailed ? "alert" : "status"}>{loadFailed ? taskT("loadFailed") : common("loading")}</p>
      {loadFailed ? <Button className="mx-4" variant="outline" onClick={() => openTaskDrawer(selectedItem.id)}>{taskT("retryLoad")}</Button> : null}
    </Drawer> : null}
    {selectedTask ? <TaskDetailsDrawer key={selectedTask.id} canManageTasks={false} currentUserId={currentUserId} isOpen={isTaskDrawerOpen} isProjectReadOnly={false} members={[]} onClose={closeTaskDrawer} onExited={clearExitedTask} onTaskUpdated={updateTask} task={selectedTask} /> : null}
  </>;
}
