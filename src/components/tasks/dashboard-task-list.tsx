"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loadDashboardTask } from "@/app/(app)/dashboard/task-actions";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { FolderKanban, X } from "lucide-react";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { getTodayDate, type AdminMyWorkItem } from "@/lib/dashboard";
import { isTaskOverdue } from "@/lib/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { DashboardTaskSummary, ProjectTask } from "@/types/tasks";

export function DashboardTaskList({ currentUserId, tasks, items, today }: { currentUserId: string; tasks: DashboardTaskSummary[]; items: AdminMyWorkItem[]; today?: string }) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const taskT = useTranslations("Tasks");
  const status = useTranslations("Status");
  const stages = useTranslations("TaskStages");
  const priority = useTranslations("Priority");
  const office = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const dateToday = today ?? getTodayDate();
  const [taskItems, setTaskItems] = useState(tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const isTaskDrawerOpenRef = useRef(false);
  const selectedItem = selectedTaskId ? taskItems.find((task) => task.id === selectedTaskId) ?? null : null;
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const detailRequest = useRef(0);
  const displayItems: AdminMyWorkItem[] = items.flatMap<AdminMyWorkItem>((entry) => entry.kind === "task"
    ? taskItems.flatMap((task) => task.id === entry.task.id ? [{ kind: "task" as const, task }] : [])
    : [entry]);

  function openTaskDrawer(taskId: string) {
    isTaskDrawerOpenRef.current = true;
    setSelectedTaskId(taskId);
    setIsTaskDrawerOpen(false);
    setSelectedTask(null);
    setLoadFailed(false);
    const request = ++detailRequest.current;
    const item = taskItems.find((task) => task.id === taskId);
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
    setTaskItems((current) => current.map((task) => task.id === updatedTask.id ? { ...task, ...updatedTask } : task));
  }

  return <>
    <ul className="divide-y divide-[var(--ui-border-subtle)]">
      {displayItems.map((entry) => {
        if (entry.kind === "assignment") {
          const assignment = entry.assignment;
          const overdue = Boolean(assignment.deadline && assignment.deadline < dateToday);
          const statusTone = assignment.status === "done" ? "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]" : assignment.status === "in_progress" ? "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
          const relevantPriority = assignment.priority === "high" || assignment.priority === "urgent";
          return <li key={`assignment:${assignment.id}`} className="group rounded-[var(--ui-radius-control)] px-3 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] sm:px-4">
            <Link href={`/office/assignments?item=${assignment.id}`} className="grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-x-3 gap-y-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] md:grid-cols-[minmax(0,1fr)_max-content_max-content]">
              <span className="min-w-0"><b className="block truncate text-sm font-medium text-[var(--ui-text)]">{assignment.title}</b><small className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{t("officeAssignment")}{relevantPriority ? ` · ${priority(assignment.priority)}` : ""}</small></span>
              <span className={`ui-numeric text-xs ${overdue ? "font-semibold text-[var(--ui-danger-text)]" : assignment.deadline === dateToday ? "font-medium text-[var(--ui-warning-text)]" : "text-[var(--ui-text-muted)]"}`}>{overdue ? `${t("overdue")} · ` : ""}{assignment.deadline ? formatDate(assignment.deadline, locale) : taskT("noDueDate")}</span>
              <span className={`col-span-2 w-fit max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium md:col-span-1 ${statusTone}`}>{office(`statuses.${assignment.status}`)}</span>
            </Link>
          </li>;
        }
        const task = entry.task;
        const overdue = isTaskOverdue(task, dateToday);
        const dueToday = task.due_date === dateToday;
        const relevantPriority = task.priority === "high" || task.priority === "urgent";
        return <li key={task.id} className="group grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-x-1 rounded-[var(--ui-radius-control)] px-3 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] sm:px-4 xl:grid-cols-[minmax(0,1fr)_10rem_5rem_10rem_2.25rem]">
          <button type="button" aria-label={`${task.title}. ${t("openTaskDetails")}`} onClick={() => openTaskDrawer(task.id)} className="grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-x-3 gap-y-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] xl:col-span-4 xl:grid-cols-[minmax(0,1fr)_10rem_5rem_10rem] xl:gap-x-1">
            <span className="min-w-0"><b className="block truncate text-sm font-medium text-[var(--ui-text)]">{task.title}</b><small className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{task.project.name}{relevantPriority ? ` · ${priority(task.priority)}` : ""}</small></span>
            <span className={`ui-numeric min-w-0 truncate whitespace-nowrap text-xs ${overdue ? "font-semibold text-[var(--ui-danger-text)]" : dueToday ? "font-medium text-[var(--ui-warning-text)]" : "text-[var(--ui-text-muted)]"}`} title={task.due_date ? formatDate(task.due_date, locale) : taskT("noDueDate")}>{overdue ? `${t("overdue")} · ` : ""}{task.due_date ? formatDate(task.due_date, locale) : taskT("noDueDate")}</span>
            <span className="min-w-0 truncate text-xs text-[var(--ui-text-muted)]" title={stages(task.stage)}>{stages(task.stage)}</span>
            <span className={`w-fit max-w-full truncate whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${getTaskStatusBadgeStyle(task.status).className}`}>{status(task.status === "in_progress" ? "inProgress" : task.status)}</span>
          </button>
          <Link href={`/projects/${task.project_id}?task=${task.id}`} aria-label={taskT("goToProject")} title={taskT("goToProject")} onClick={(event) => event.stopPropagation()} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><FolderKanban className="size-4" aria-hidden="true" /></Link>
        </li>;
      })}
    </ul>
    {selectedItem && isTaskDrawerOpen && !selectedTask ? <Drawer className="w-full max-w-[34rem]" title={taskT("taskDetails")} isOpen={isTaskDrawerOpen} onClose={closeTaskDrawer} onExited={clearExitedTask}>
      <div className="flex items-center justify-between border-b border-[var(--ui-border)] p-4"><h2 className="font-semibold">{selectedItem.title}</h2><Button aria-label={taskT("closeTaskDetails")} size="sm" variant="ghost" onClick={closeTaskDrawer}><X className="size-4" /></Button></div>
      <p className="p-4 text-sm text-[var(--ui-text-muted)]" role={loadFailed ? "alert" : "status"}>{loadFailed ? taskT("loadFailed") : common("loading")}</p>
      {loadFailed ? <Button className="mx-4" variant="outline" onClick={() => openTaskDrawer(selectedItem.id)}>{taskT("retryLoad")}</Button> : null}
    </Drawer> : null}
    {selectedTask ? <TaskDetailsDrawer key={selectedTask.id} canManageTasks={false} currentUserId={currentUserId} isOpen={isTaskDrawerOpen} isProjectReadOnly={false} members={[]} onClose={closeTaskDrawer} onExited={clearExitedTask} onTaskUpdated={updateTask} task={selectedTask} /> : null}
  </>;
}
