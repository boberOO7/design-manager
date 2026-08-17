import { PageHeader } from "@/components/shared/page-header";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { EmptyState } from "@/components/ui/empty-state";
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
        <EmptyState title={t("emptyMyTasks")} description={t("emptyMyTasksDescription")} />
      ) : profile ? <MyTasksList currentUserId={profile.id} tasks={tasks} /> : null}
    </div>
  );
}
