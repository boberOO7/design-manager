"use client";

import Link from "next/link";
import { useState } from "react";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { getEmployeeTasksNeedingAttention, getTodayDate } from "@/lib/dashboard";
import { getTaskPriorityLabel, getTaskStatusLabel, isTaskOverdue, mergeProjectTask } from "@/lib/tasks";
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
    <div className="space-y-2">
      {items.length === 0 && emptyState ? <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center"><p className="font-medium text-stone-900">{emptyState.title}</p><p className="mt-1 text-sm text-stone-500">{emptyState.description}</p><Link href={emptyState.linkHref} className="mt-3 inline-block text-sm font-medium text-stone-900 underline">{emptyState.linkLabel}</Link></div> : null}
      {items.map((task) => {
        const overdue = isTaskOverdue(task);
        const dueToday = task.due_date === getTodayDate();
        return <article key={task.id} role="button" tabIndex={0} onClick={() => setSelectedTaskId(task.id)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedTaskId(task.id); }
        }} className="cursor-pointer rounded-xl border border-stone-200 p-3 outline-none transition hover:border-stone-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-stone-500">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="truncate font-medium text-stone-900">{task.title}</h3><Link href={`/projects/${task.project_id}`} onClick={(event) => event.stopPropagation()} className="mt-1 block truncate text-sm text-stone-500 hover:text-stone-900 hover:underline">{task.project.name}</Link></div>
            <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700">{getTaskStatusLabel(task.status)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{getTaskPriorityLabel(task.priority)}</span>{task.due_date ? <span className={overdue ? "rounded-full bg-red-50 px-2 py-1 font-medium text-red-700" : dueToday ? "rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-800" : "rounded-full bg-stone-100 px-2 py-1 text-stone-600"}>{overdue ? "Overdue" : dueToday ? "Due today" : `Due ${formatDate(task.due_date)}`}</span> : null}</div>
        </article>;
      })}
    </div>
    {selectedTask ? <TaskDetailsDrawer key={selectedTask.id} canManageTasks={false} currentUserId={currentUserId} isProjectReadOnly={false} members={[]} onClose={() => setSelectedTaskId(null)} onTaskUpdated={updateTask} project={selectedTask.project} task={selectedTask} /> : null}
  </>;
}
