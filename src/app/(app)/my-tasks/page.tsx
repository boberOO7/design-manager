import { PageHeader } from "@/components/shared/page-header";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { getCurrentUserProfile } from "@/data/queries";
import { getMyTasks } from "@/data/queries/tasks";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tasks");
  return { title: t("myTasks") };
}

export default async function MyTasksPage() {
  const t = await getTranslations("Tasks");
  const [profile, tasks] = await Promise.all([getCurrentUserProfile(), getMyTasks()]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("myTasks")} description={t("myTasksDescription")} />
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-10 text-center">
          <h2 className="font-semibold text-[var(--ui-text)]">No tasks assigned</h2>
          <p className="mt-1 text-sm text-[var(--ui-text-muted)]">Tasks assigned to you will appear here.</p>
        </div>
      ) : profile ? <MyTasksList currentUserId={profile.id} tasks={tasks} /> : null}
    </div>
  );
}
