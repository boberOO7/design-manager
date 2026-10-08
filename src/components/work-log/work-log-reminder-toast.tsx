"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Clock3, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { parseDateOnly } from "@/lib/calendar";
import type { WorkLogReminder } from "@/lib/work-log-reminder";

export function WorkLogReminderToast({ reminder, onOpen, onDismiss }: {
  reminder: WorkLogReminder; onOpen: () => void; onDismiss: () => void;
}) {
  const t = useTranslations("WorkLog");
  const locale = useLocale();
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const startDismiss = useCallback(() => setClosing(true), []);
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (paused || closing) return;
    const timer = window.setTimeout(startDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [paused, closing, startDismiss]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => dismiss(), 160);
    return () => window.clearTimeout(timer);
  }, [closing]);
  const message = reminder.kind === "week" ? t("previousWeekReminder", { count: reminder.count })
    : reminder.yesterday ? t("missingYesterday") : t("missingDate", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDateOnly(reminder.date)) });
  return <div role="status" aria-live="polite" aria-atomic="true" data-work-log-reminder
    onMouseEnter={() => setPaused(true)} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setPaused(false); }}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setPaused(false); }}
    className={`notification-toast fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-40 flex gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] py-4 pl-4 pr-14 shadow-[var(--ui-shadow-popover)] motion-reduce:animate-none sm:left-auto sm:right-6 sm:w-96 ${closing ? "notification-toast--closing" : ""}`}>
    <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" />
    <div className="min-w-0 space-y-2"><p className="text-sm text-[var(--ui-text-secondary)]">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onOpen}>{t(reminder.kind === "week" ? "reviewWeek" : "fill")}</Button>
    </div>
    <button type="button" aria-label={t("dismissReminder")} onClick={startDismiss} className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><X aria-hidden className="size-4" /></button>
  </div>;
}
