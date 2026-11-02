"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDate } from "@/lib/utils";
import { formatStatisticsDuration } from "@/lib/statistics";
import type { TaskWorkTime } from "@/data/queries/task-work-time";

export function TaskSpentTime({ taskId }: { taskId: string }) {
  const t = useTranslations("Tasks");
  const locale = useLocale();
  const commonT = useTranslations("Common");
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  const [report, setReport] = useState<TaskWorkTime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setFailed(false);
    void fetch(`/api/tasks/${taskId}/time`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load task time");
        const data: TaskWorkTime = await response.json();
        if (!controller.signal.aborted) setReport(data);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [taskId, attempt]);
  const duration = (minutes: number) => `${formatStatisticsDuration(minutes / 60)} ${t("spentTimeUnit")}`;
  const split = (row: { taskMinutes: number; reviewMinutes: number }) => <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)]">
    <span>{t("spentTimeWork")}: {duration(row.taskMinutes)}</span><span>{t("spentTimeReview")}: {duration(row.reviewMinutes)}</span>
  </span>;
  const label = t(report?.ownTimeOnly ? "spentTimeOwn" : "spentTime");
  const summary = report ? `${label} · ${duration(report.totalMinutes)}` : label;
  return <div data-task-spent-time className="min-w-0 text-xs">
    {failed ? <div className="flex min-h-9 items-center gap-2"><p role="alert" className="text-[var(--ui-danger-text)]">{t("spentTimeFailed")}</p><Button size="compact" variant="ghost" onClick={() => setAttempt(value => value + 1)}>{t("spentTimeRetry")}</Button></div>
      : !report ? <p role="status" className="flex min-h-9 items-center text-[var(--ui-text-muted)]">{t("spentTimeLoading")}</p>
        : !report.totalMinutes ? <p className="flex min-h-9 items-center gap-1.5 text-[var(--ui-text-muted)]"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" />{label} · {t("spentTimeEmpty")}</p>
          : <Popover.Root>
            <Popover.Trigger asChild>
              <button ref={setTriggerNode} type="button" aria-label={summary} className="group inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-[var(--ui-radius-control)] px-2 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none">
                <Clock3 className="size-3.5 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" />
                <span className="text-[var(--ui-text-muted)]">{label}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-[var(--ui-text)]">{duration(report.totalMinutes)}</span>
                <ChevronDown className="size-3.5 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal container={portalContainer}>
              <Popover.Content aria-label={label} align="end" sideOffset={6} collisionPadding={12} className="task-time-popover z-[80] max-h-[min(32rem,70dvh,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">{label}</h4>
                  <Popover.Close aria-label={commonT("close")} className="flex size-8 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-4" aria-hidden="true" /></Popover.Close>
                </div>
                <p className="mb-2 text-lg font-semibold tabular-nums">{duration(report.totalMinutes)}</p>
                {report.correctionMinutes > 0 ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("correctionTime")}: {duration(report.correctionMinutes)}</p> : null}
                {report.corrections.map(correction => <p key={correction.id} className="mt-1 text-xs text-[var(--ui-text-muted)]">{correction.description}: {duration(correction.minutes)}</p>)}
                {report.reviewMinutes > 0 ? split(report) : null}
                <ul className="mt-3 divide-y divide-[var(--ui-border-subtle)]">
                  {report.employees.map(person => <li key={person.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2 text-xs"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.name ?? t("unknown")} size="boardCard" /><span className="min-w-0 flex-1 break-words font-medium">{person.name ?? t("unknown")}</span><span className="shrink-0 font-semibold tabular-nums">{duration(person.totalMinutes)}</span></div>
                    {person.reviewMinutes > 0 ? <div className="mt-1.5 pl-9">{split(person)}</div> : null}
                    <dl className="mt-2 space-y-2 pl-9 text-xs">{person.days.map(day => <div key={day.date} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><dt className="text-[var(--ui-text-muted)]">{formatDate(day.date, locale)}</dt><dd className="font-medium tabular-nums">{duration(day.totalMinutes)}</dd>{person.reviewMinutes > 0 ? <dd className="w-full">{split(day)}</dd> : null}</div>)}</dl>
                  </li>)}
                </ul>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>}
  </div>;
}
