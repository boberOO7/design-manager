import { PageHeader } from "@/components/shared/page-header";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { getCurrentUserProfile } from "@/data/queries";
import { getMyTasks, getMyTaskStageNames } from "@/data/queries/tasks";
import { getMyOfficeAssignments } from "@/data/queries/office-assignments";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tasks");
  return { title: t("myTasks") };
}

export default async function MyTasksPage() {
  const t = await getTranslations("Tasks");
  const [profile, tasks, assignments] = await Promise.all([getCurrentUserProfile(), getMyTasks(), getMyOfficeAssignments()]);
  const stageNames = await getMyTaskStageNames([...new Set(tasks.map((task) => task.project_id))]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader title={t("myTasks")} description={t("myTasksDescription")} />
      {profile ? <MyTasksList currentUserId={profile.id} tasks={tasks} assignments={assignments} stageNames={stageNames} today={today} /> : null}
    </div>
  );
}
