"use client";

import Link from "next/link";
import { useState } from "react";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { getTaskPriorityLabel, getTaskStatusLabel, groupMyTasks, mergeProjectTask, type MyTaskGroupId } from "@/lib/tasks";
import { formatDate } from "@/lib/utils";
import type { MyTask, ProjectTask } from "@/types/tasks";

const sections: Array<{ id: MyTaskGroupId; title: string; description: string }> = [
  { id: "overdue", title: "Overdue", description: "Open work past its due date" },
  { id: "today", title: "Today", description: "Work due today" },
  { id: "upcoming", title: "Upcoming", description: "Current and upcoming work" },
  { id: "completed", title: "Completed", description: "Finished or cancelled work" },
];

export function MyTasksList({ currentUserId, tasks: initialTasks }: { currentUserId: string; tasks: MyTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const groups = groupMyTasks(tasks);
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

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
                <h2 id={`my-tasks-${section.id}`} className="font-semibold text-stone-900">{section.title}</h2>
                <p className="text-sm text-stone-500">{section.description}</p>
              </div>
              <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700">{groups[section.id].length}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups[section.id].map((task) => (
                <article
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTaskId(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTaskId(task.id);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-4 shadow-sm outline-none transition hover:border-stone-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-stone-900">{task.title}</h3>
                      <Link href={`/projects/${task.project_id}`} onClick={(event) => event.stopPropagation()} className="mt-1 block truncate text-sm text-stone-500 hover:text-stone-900 hover:underline">{task.project.name}</Link>
                    </div>
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{getTaskStatusLabel(task.status)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-500">
                    <span>{getTaskPriorityLabel(task.priority)}</span>
                    <span>{task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}</span>
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
        isProjectReadOnly={false}
        members={[]}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={updateTask}
        project={selectedTask.project}
        task={selectedTask}
      /> : null}
    </>
  );
}
