"use client";

import Link from "next/link";
import { useState } from "react";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { getEmployeeTasksNeedingAttention, getTodayDate } from "@/lib/dashboard";
import { getTaskPriorityLabel, getTaskStatusLabel, isTaskOverdue, mergeProjectTask } from "@/lib/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { MyTask, ProjectTask } from "@/types/tasks";

export function DashboardTaskList({ currentUserId, tasks, needsAttentionOnly = false, emptyState }: { currentUserId: string; tasks: MyTask[]; needsAttentionOnly?: boolean; emptyState?: { title: string; description: string; linkHref: string; linkLabel: string } }) {
  const [items, setItems] = useState(tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = selectedTaskId ? items.find((task) => task.id === selectedTaskId) ?? null : null;

  function updateTask(updatedTask: ProjectTask) {
    setItems((current) => {
      const next = mergeProjectTask(current, updatedTask);
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
        return <li key={task.id} className="px-3 py-2.5 sm:px-4">
          <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0"><button type="button" onClick={() => setSelectedTaskId(task.id)} className="min-h-11 max-w-full cursor-pointer break-words text-left font-medium leading-5 text-[var(--ui-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{task.title}<span className="sr-only">, open task details</span></button></div>
            <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${getTaskStatusBadgeStyle(task.status).className}`}>{getTaskStatusLabel(task.status)}</span>
          </div>
          <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><Link href={`/projects/${task.project_id}`} className="break-words text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{task.project.name}</Link><span aria-hidden="true" className="text-[var(--ui-text-muted)]">·</span><span className={`rounded-full px-1.5 py-0.5 font-medium ${getPriorityBadgeStyle(task.priority).className}`}>{getTaskPriorityLabel(task.priority)}</span>{task.due_date ? <><span aria-hidden="true" className="text-[var(--ui-text-muted)]">·</span><span className={overdue ? "font-medium text-[var(--ui-danger-text)]" : dueToday ? "font-medium text-[var(--ui-warning-text)]" : "text-[var(--ui-text-secondary)]"}>{overdue ? "Overdue" : dueToday ? "Due today" : `Due ${formatDate(task.due_date)}`}</span></> : null}</div>
        </li>;
      })}
      </ul> : null}
    </div>
    {selectedTask ? <TaskDetailsDrawer key={selectedTask.id} canManageTasks={false} currentUserId={currentUserId} isProjectReadOnly={false} members={[]} onClose={() => setSelectedTaskId(null)} onTaskUpdated={updateTask} project={selectedTask.project} task={selectedTask} /> : null}
  </>;
}
