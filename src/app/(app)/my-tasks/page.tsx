import { PageHeader } from "@/components/shared/page-header";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { getCurrentUserProfile } from "@/data/queries";
import { getMyTasks } from "@/data/queries/tasks";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Tasks | StudioFlow",
};

export default async function MyTasksPage() {
  const [profile, tasks] = await Promise.all([getCurrentUserProfile(), getMyTasks()]);

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Real project work assigned specifically to you." />
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-stone-900">No tasks assigned</h2>
          <p className="mt-1 text-sm text-stone-500">Tasks assigned to you will appear here.</p>
        </div>
      ) : profile ? <MyTasksList currentUserId={profile.id} tasks={tasks} /> : null}
    </div>
  );
}
