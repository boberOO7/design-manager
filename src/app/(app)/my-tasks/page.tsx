import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { TaskStatusControl } from "@/components/tasks/task-status-control";
import { getMyTasks } from "@/data/queries/tasks";
import { getTaskPriorityLabel, getTaskStatusLabel, groupMyTasks, type MyTaskGroupId } from "@/lib/tasks";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Tasks | StudioFlow",
};

const sections: Array<{ id: MyTaskGroupId; title: string; description: string }> = [
  { id: "overdue", title: "Overdue", description: "Open work past its due date" },
  { id: "today", title: "Today", description: "Work due today" },
  { id: "upcoming", title: "Upcoming", description: "Current and upcoming work" },
  { id: "completed", title: "Completed", description: "Finished or cancelled work" },
];

export default async function MyTasksPage() {
  const tasks = await getMyTasks();
  const groups = groupMyTasks(tasks);

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Real project work assigned specifically to you." />
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-stone-900">No tasks assigned</h2>
          <p className="mt-1 text-sm text-stone-500">Tasks assigned to you will appear here.</p>
        </div>
      ) : (
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
                  <article key={task.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-stone-900">{task.title}</h3>
                        <Link href={`/projects/${task.project_id}`} className="mt-1 block truncate text-sm text-stone-500 hover:text-stone-900 hover:underline">{task.project.name}</Link>
                      </div>
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{getTaskStatusLabel(task.status)}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-500">
                      <span>{getTaskPriorityLabel(task.priority)}</span>
                      <span>{task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}</span>
                    </div>
                    <TaskStatusControl taskId={task.id} status={task.status} />
                  </article>
                ))}
              </div>
            </section>
          ) : null)}
        </div>
      )}
    </div>
  );
}
