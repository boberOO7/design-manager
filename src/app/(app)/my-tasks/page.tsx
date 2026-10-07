import { PageHeader } from "@/components/shared/page-header";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { TaskReviewQueue } from "@/components/tasks/task-review-queue";
import { getTaskReviewQueue } from "@/data/queries/task-reviews";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { getCurrentUserProfile } from "@/data/queries";
import { getMyTasks, getMyTaskStageNames } from "@/data/queries/tasks";
import { getMyOfficeAssignments } from "@/data/queries/office-assignments";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tasks");
  return { title: t("myTasks") };
}

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations("Tasks");
  const reviewView = (await searchParams).view === "review";
  const [profile, tasks, assignments, rounds] = await Promise.all([getCurrentUserProfile(), reviewView ? Promise.resolve([]) : getMyTasks(), reviewView ? Promise.resolve([]) : getMyOfficeAssignments(), getTaskReviewQueue()]);
  const stageNames = await getMyTaskStageNames([...new Set(tasks.map((task) => task.project_id))]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader title={t("myTasks")} description={t("myTasksDescription")} />
      <nav aria-label={t("taskViews")} className="flex w-fit gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">
        {[{ href: "/my-tasks", label: t("myTasks"), active: !reviewView, count: 0 }, { href: "/my-tasks?view=review", label: t("reviewQueue"), active: reviewView, count: rounds.length }].map((view) => <Link key={view.href} href={view.href} aria-current={view.active ? "page" : undefined} className={`flex min-h-9 items-center gap-2 rounded-[var(--ui-radius-control)] px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${view.active ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"}`}>{view.label}{view.count > 0 ? <span className="rounded-full bg-[var(--ui-info-surface)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--ui-info-text)]">{view.count}</span> : null}</Link>)}
      </nav>
      {!reviewView && rounds.length > 0 ? <Link href="/my-tasks?view=review" className="flex items-center gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-sm transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-info-text)]" />
        <span className="flex-1 text-[var(--ui-text)]">{t("reviewQueuePending", { count: rounds.length })}</span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" />
      </Link> : null}
      {profile ? reviewView ? <TaskReviewQueue rounds={rounds} /> : <MyTasksList currentUserId={profile.id} tasks={tasks} assignments={assignments} stageNames={stageNames} today={today} /> : null}
    </div>
  );
}
