"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { groupMyTasks, mergeProjectTask, type MyTaskGroupId } from "@/lib/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { MyTask, ProjectTask } from "@/types/tasks";

const sections: Array<{ id: MyTaskGroupId; title: "overdue" | "today" | "upcoming" | "completed"; description: "overdueDescription" | "todayDescription" | "upcomingDescription" | "completedDescription" }> = [
  { id: "overdue", title: "overdue", description: "overdueDescription" },
  { id: "today", title: "today", description: "todayDescription" },
  { id: "upcoming", title: "upcoming", description: "upcomingDescription" },
  { id: "completed", title: "completed", description: "completedDescription" },
];

export function MyTasksList({ currentUserId, tasks: initialTasks }: { currentUserId: string; tasks: MyTask[] }) {
  const t = useTranslations("Tasks");
  const status = useTranslations("Status");
  const priority = useTranslations("Priority");
  const locale = useLocale();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const isTaskDrawerOpenRef = useRef(false);
  const groups = groupMyTasks(tasks);
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

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

  return (
    <>
      <div className="space-y-6">
        {sections.map((section) => groups[section.id].length > 0 ? (
          <section key={section.id} aria-labelledby={`my-tasks-${section.id}`}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id={`my-tasks-${section.id}`} className="font-semibold text-[var(--ui-text)]">{t(section.title)}</h2>
                <p className="text-sm text-[var(--ui-text-muted)]">{t(section.description)}</p>
              </div>
              <span className="rounded-full bg-[var(--ui-surface-strong)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text-secondary)]">{groups[section.id].length}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups[section.id].map((task) => (
                <article
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTaskDrawer(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTaskDrawer(task.id);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-sm outline-none transition hover:border-[var(--ui-border-strong)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--ui-text)]">{task.title}</h3>
                      <Link href={`/projects/${task.project_id}`} onClick={(event) => event.stopPropagation()} className="mt-1 block truncate text-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:underline">{task.project.name}</Link>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${getTaskStatusBadgeStyle(task.status).className}`}>{status(task.status === "in_progress" ? "inProgress" : task.status)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--ui-text-muted)]">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${getPriorityBadgeStyle(task.priority).className}`}>{priority(task.priority)}</span>
                    <span>{task.due_date ? t("due", { date: formatDate(task.due_date, locale) }) : t("noDueDate")}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null)}
      </div>
      {selectedTask ? <TaskDetailsDrawer
        key={selectedTask.id}
        canManageTasks={false}
        currentUserId={currentUserId}
        isProjectReadOnly={selectedTask.project.status === "completed" || selectedTask.project.status === "archived" || selectedTask.project.archived_at !== null}
        members={[]}
        isOpen={isTaskDrawerOpen}
        onClose={closeTaskDrawer}
        onExited={clearExitedTask}
        onTaskUpdated={updateTask}
        project={selectedTask.project}
        task={selectedTask}
      /> : null}
    </>
  );
}
