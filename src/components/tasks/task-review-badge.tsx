"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getCurrentStatusDuration } from "@/lib/dashboard";
import { getActiveTaskReview, isTaskInRework } from "@/lib/task-reviews";
import type { ProjectTask } from "@/types/tasks";

export function TaskReviewBadge({ task }: { task: Pick<ProjectTask, "status" | "review_rounds"> }) {
  const t = useTranslations("Tasks");
  const active = getActiveTaskReview(task);
  const rework = isTaskInRework(task);
  if (!active && !rework) return null;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"}`}>
    {active ? t("reviewRound", { number: active.round_number }) : t("reviewReworkBadge")}
  </span>;
}

export function TaskReviewWaiting({ submittedAt }: { submittedAt: string }) {
  const t = useTranslations("Tasks");
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const duration = getCurrentStatusDuration(submittedAt, now);
  if (!duration) return null;
  const label = duration.days === 0 && duration.hours === 0 ? t("statusDurationUnderHour")
    : duration.days === 0 ? t("statusDurationHours", { count: duration.hours })
      : t("statusDurationDaysHours", { days: duration.days, hours: duration.hours });
  return <span className="ui-numeric text-xs text-[var(--ui-text-muted)]">{t("reviewWaiting", { duration: label })}</span>;
}
