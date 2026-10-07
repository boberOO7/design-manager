import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TaskReviewWaiting } from "./task-review-badge";
import { getPriorityBadgeStyle } from "@/lib/semantic-styles";
import type { TaskReviewQueueItem } from "@/data/queries/task-reviews";

export async function TaskReviewQueue({ rounds }: { rounds: TaskReviewQueueItem[] }) {
  const t = await getTranslations("Tasks");
  const priority = await getTranslations("Priority");
  if (!rounds.length) return <p className="py-10 text-center text-sm text-[var(--ui-text-muted)]">{t("reviewQueueEmpty")}</p>;
  return <ul aria-label={t("reviewQueue")} className="divide-y divide-[var(--ui-border-subtle)] border-y border-[var(--ui-border)] bg-[var(--ui-surface)]">
    {rounds.map((round) => <li key={round.id}>
      <Link href={`/projects/${round.task.project.id}?task=${round.task.id}`} aria-label={t("openTask", { name: round.task.title })} className="flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
        <span className="min-w-0 flex-[2_1_16rem]"><span className="block truncate text-xs text-[var(--ui-text-muted)]">{round.task.project.name}</span><span className="block break-words text-sm font-medium text-[var(--ui-text)]">{round.task.title}</span></span>
        <span className="min-w-0 flex-[1_1_10rem] text-xs text-[var(--ui-text-secondary)]">{t("assignee")}: {round.task.assignee?.full_name ?? t("unassigned")}<span className="mt-1 block">{t("reviewer")}: {round.reviewer?.full_name ?? t("unknown")}</span></span>
        <span className="space-y-1"><span className="block text-xs font-medium text-[var(--ui-info-text)]">{t("reviewRound", { number: round.round_number })}</span><TaskReviewWaiting submittedAt={round.submitted_at} /></span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadgeStyle(round.task.priority).className}`}>{priority(round.task.priority)}</span>
      </Link>
    </li>)}
  </ul>;
}
