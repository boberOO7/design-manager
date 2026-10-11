"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { instantToDateOnly } from "@/lib/calendar";
import { workLogDayBounds, workLogRemindersSchema, type WorkLogReminders } from "@/lib/work-log";
import { isWorkLogReminderRelevant, takeWorkLogReminder, type WorkLogReminder } from "@/lib/work-log-reminder";
import { WorkLogReminderToast } from "./work-log-reminder-toast";

const WorkLogDialog = dynamic(() => import("./work-log-dialog").then(module => module.WorkLogDialog));

export function WorkLogTrigger() {
  const t = useTranslations("WorkLog");
  const [open, setOpen] = useState(false);
  const [initialDate, setInitialDate] = useState<string>();
  const [data, setData] = useState<WorkLogReminders | null>(null);
  const [reminder, setReminder] = useState<WorkLogReminder | null>(null);
  const seen = useRef(new Map<string, string>());
  const modalOpen = useRef(false);
  const requestSequence = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback((showToast = true, signal?: AbortSignal) => {
    if (showToast && inFlight.current) return inFlight.current;
    const sequence = ++requestSequence.current;
    const request = (async () => {
      try {
        const response = await fetch("/api/work-log?mode=reminders", { signal });
        if (!response.ok) return;
        const loaded = workLogRemindersSchema.parse(await response.json());
        if (signal?.aborted || sequence !== requestSequence.current) return;
        setData(loaded);
        setReminder(current => current && isWorkLogReminderRelevant(current, loaded) ? current : null);
        if (!showToast || modalOpen.current) return;
        let next: WorkLogReminder | null;
        try { next = takeWorkLogReminder(loaded, window.sessionStorage); }
        catch { next = takeWorkLogReminder(loaded, { getItem: key => seen.current.get(key) ?? null, setItem: (key, value) => { seen.current.set(key, value); } }); }
        if (next) setReminder(next);
      } catch { /* Optional reminders must never block the daily editor. */ }
    })().finally(() => { if (inFlight.current === request) inFlight.current = null; });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => { void refresh(true, controller.signal); }, 0);
    const onFocus = () => { void refresh(true, controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearTimeout(initialLoad); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  useEffect(() => {
    // Refresh when a long-running session crosses midnight in Kyiv.
    const today = instantToDateOnly(new Date().toISOString());
    const timer = window.setTimeout(() => { void refresh(); }, Date.parse(workLogDayBounds(today).end) - Date.now() + 1000);
    return () => window.clearTimeout(timer);
  }, [refresh, data?.today]);

  function launch(date?: string) {
    modalOpen.current = true;
    setInitialDate(date); setReminder(null); setOpen(true);
  }
  const missingCount = data?.missingDates.length ?? 0;
  return <>
    <Button type="button" variant="ghost" size="compact" aria-label={t("entry")} aria-describedby={missingCount ? "work-log-missing-count" : undefined}
      onClick={() => launch(missingCount ? data?.missingDates[missingCount - 1] : undefined)}>
      <Clock3 aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{t("entry")}</span>
      {missingCount ? <span id="work-log-missing-count" data-work-log-missing-count className="rounded bg-[var(--ui-surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ui-text-muted)]">{t("missingCount", { count: missingCount })}</span> : null}
    </Button>
    {reminder && !open ? <WorkLogReminderToast key={`${reminder.kind}:${reminder.date}`} reminder={reminder} onDismiss={() => setReminder(null)}
      onOpen={() => launch(reminder.date)} /> : null}
    {open ? <WorkLogDialog initialDate={initialDate} onSaved={() => { setReminder(null); void refresh(false); }} onClose={() => { modalOpen.current = false; setOpen(false); }} /> : null}
  </>;
}
