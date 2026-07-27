import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile, getMyTasksData } from "@/data/queries";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Tasks | StudioFlow",
};

export default async function MyTasksPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Tasks" description="Please log in to view your tasks." />
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">You must be logged in to view your tasks.</p>
        </div>
      </div>
    );
  }

  const tasks = getMyTasksData();

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Track the work assigned to you and its delivery status." />
      <div className="grid gap-4">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-stone-900">{task.title}</p>
                <p className="text-sm text-stone-500">{task.project_name}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{task.status}</span>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
              <span>Priority: {task.priority}</span>
              <span>Due: {formatDate(task.due_date)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
