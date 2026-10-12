"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, ListTodo, Plus, ShieldCheck, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { addCalendarDays, instantToDateOnly, parseDateOnly, startOfMondayWeek } from "@/lib/calendar";
import { dailyWorkLogSchema, groupWorkLogRows, isWorkLogDateEditable, previewWorkLogWeek, summarizeLoggedTime, weeklyWorkLogSchema, workLogInputSchema, workLogRowKey, type WeeklyWorkLog } from "@/lib/work-log";
import { WorkLogGroup } from "./work-log-group";
import { WorkLogWeek } from "./work-log-week";
import type { DailyWorkLog } from "@/data/queries/work-log";

export function WorkLogDialog({ onClose, initialDate, onSaved }: {
  onClose: () => void; initialDate?: string; onSaved?: () => void;
}) {
  const t = useTranslations("WorkLog");
  const locale = useLocale();
  const router = useRouter();
  const today = instantToDateOnly(new Date().toISOString());
  const [date, setDate] = useState(() => initialDate && isWorkLogDateEditable(initialDate, today) ? initialDate : today);
  const weekDate = startOfMondayWeek(date);
  const [week, setWeek] = useState<WeeklyWorkLog | null>(null);
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [weekError, setWeekError] = useState("");
  const [catchUpDates, setCatchUpDates] = useState<string[]>([]);
  const [data, setData] = useState<DailyWorkLog | null>(null);
  const [rows, setRows] = useState<DailyWorkLog["rows"]>([]);
  const [adding, setAdding] = useState(false);
  const [addingOthers, setAddingOthers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const duration = (minutes: number) => t("duration", { hours: Math.floor(Math.round(minutes) / 60), minutes: Math.round(minutes) % 60 });

  const editorDisabled = saving || loadingDay || data?.date !== date || !isWorkLogDateEditable(date, today);
  const weekDisabled = loadingWeek || week?.start !== weekDate || Boolean(weekError);
  const visibleError = error || weekError;

  useEffect(() => {
    const controller = new AbortController();
    setLoadingDay(true); setError(""); setAdding(false); setAddingOthers(false); setDirty(false);
    void fetch(`/api/work-log?date=${date}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unable to load log");
      const log = dailyWorkLogSchema.parse(await response.json());
      if (!controller.signal.aborted) {
        setData(log);
        setRows(log.rows);
        setLoadingDay(false);
      }
    }).catch(() => { if (!controller.signal.aborted) { setError(t("loadFailed")); setLoadingDay(false); } });
    return () => controller.abort();
  }, [date, attempt, t]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingWeek(true); setWeekError("");
    void fetch(`/api/work-log?mode=week&date=${weekDate}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unable to load week");
      const loaded = weeklyWorkLogSchema.parse(await response.json());
      if (!controller.signal.aborted) { setWeek(loaded); setLoadingWeek(false); }
    }).catch(() => { if (!controller.signal.aborted) { setWeekError(t("loadFailed")); setLoadingWeek(false); } });
    return () => controller.abort();
  }, [weekDate, attempt, t]);

  function openDay(day: string) {
    if (saving || dirty || weekDisabled || catchUpDates.length || !isWorkLogDateEditable(day, today)) return;
    setDate(day);
  }

  function navigateWeek(offset: number) {
    if (saving || dirty) return;
    const target = addCalendarDays(date, offset);
    setCatchUpDates([]);
    setDate(isWorkLogDateEditable(target, today) ? target : today);
  }

  function catchUp() {
    if (!week || weekDisabled || saving || dirty) return;
    const missing = week.days.filter(day => day.missing && day.date < today).map(day => day.date);
    if (!missing.length) return;
    setCatchUpDates(missing); setDate(missing[0]);
  }

  const total = summarizeLoggedTime(rows, data?.calendar.minutes ?? 0);
  const visibleWeek = week && dirty && !loadingDay && data?.date === date
    ? previewWorkLogWeek(week, date, rows, data.calendar.minutes) : week;
  const available: DailyWorkLog["rows"] = data ? [
    ...data.activeTasks.map(task => ({ internal_activity_type: null, activity_kind: "task" as const, task_id: task.id, review_round_id: null,
      minutes: 0, projectId: task.projectId, stage: task.stage, stageName: task.stageName, title: task.title, projectName: task.projectName, roundNumber: null })),
    ...data.additionalReviews,
  ].filter(row => !rows.some(current => workLogRowKey(current) === workLogRowKey(row))) : [];
  const personalTaskIds = new Set(data?.activeTasks.filter(task => task.isParticipating).map(task => task.id));
  const personalWork = available.filter(row => row.activity_kind === "review" || row.task_id !== null && personalTaskIds.has(row.task_id));
  const otherWork = available.filter(row => row.activity_kind === "task" && !(row.task_id !== null && personalTaskIds.has(row.task_id)));
  const choices = addingOthers ? otherWork : personalWork;

  async function save() {
    if (!data || editorDisabled) return;
    const input = workLogInputSchema.safeParse({ date: data.date, timerSnapshot: data.timerSnapshot, entries: rows.filter(row => row.minutes > 0).map(row => ({
      internal_activity_type: row.internal_activity_type, activity_kind: row.activity_kind, task_id: row.task_id, review_round_id: row.review_round_id, minutes: row.minutes,
    })) });
    if (!input.success) { setError(t("durationInvalid")); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/work-log", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      if (!response.ok) throw new Error("Save failed");
      router.refresh(); onSaved?.(); setDirty(false); setSaving(false);
      if (catchUpDates.length > 1) {
        setCatchUpDates(current => current.slice(1)); setDate(catchUpDates[1]); setAttempt(value => value + 1);
      } else {
        setCatchUpDates([]); setAttempt(value => value + 1);
      }
    } catch { setError(t("saveFailed")); setSaving(false); }
  }

  return <Dialog isOpen hideHeader ariaLabel={t("title")} closeLabel={t("close")} closeDisabled={saving}
    onRequestClose={() => { if (!saving) onClose(); }} className="max-w-[52rem] sm:h-[min(88dvh,56rem)]">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <DatePicker locale={locale} required max={today} aria-label={t("date")} data-work-log-date={date} className="h-9 w-auto" value={date}
          disabled={saving || dirty || catchUpDates.length > 0} onValueChange={value => { if (value && isWorkLogDateEditable(value, today)) setDate(value); }} />
      </div>
      <button type="button" disabled={saving} aria-label={t("close")} onClick={onClose}
        className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><X aria-hidden className="size-5" /></button>
    </header>
    {loadingDay ? <span role="status" className="sr-only">{t("loading")}</span> : null}
    <div className="shrink-0 space-y-2 border-b border-[var(--ui-border-subtle)] px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving || dirty} aria-label={t("previousWeek")} onClick={() => navigateWeek(-7)}><ChevronLeft aria-hidden className="size-4" /></Button>
        <p className="text-sm font-medium">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(parseDateOnly(weekDate))} — {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDateOnly(addCalendarDays(weekDate, 6)))}</p>
        <Button type="button" variant="ghost" size="sm" disabled={saving || dirty || weekDate >= startOfMondayWeek(today)} aria-label={t("nextWeek")} onClick={() => navigateWeek(7)}><ChevronRight aria-hidden className="size-4" /></Button>
      </div>
      <div className="min-h-20" aria-busy={loadingWeek}>
        {visibleWeek ? <WorkLogWeek week={visibleWeek} today={today} activeDate={date} disabled={saving || dirty || weekDisabled || catchUpDates.length > 0} onSelect={openDay} /> : null}
      </div>
      {catchUpDates.length ? <p className="text-xs text-[var(--ui-text-muted)]">{t("catchUpRemaining", { count: catchUpDates.length })}</p>
        : !weekDisabled && week?.days.some(day => day.missing) ? <Button type="button" variant="ghost" size="sm" disabled={saving || dirty} onClick={catchUp}>{t("fillMissing")}</Button> : null}
      {dirty ? <p className="text-xs text-[var(--ui-text-muted)]">{t("saveBeforeSwitch")}</p> : null}
    </div>
    <div data-work-log-scroll className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-gutter:stable] px-4 py-4 sm:px-6">
      {data ? <div inert={editorDisabled} aria-busy={loadingDay} className="space-y-4">
        {rows.length ? (["task", "review", "internal"] as const).map(kind => {
          const group = rows.filter(row => row.activity_kind === kind);
          if (!group.length) return null;
          const isReview = kind === "review";
          const Icon = isReview ? ShieldCheck : kind === "internal" ? BriefcaseBusiness : ListTodo;
          const label = t(isReview ? "reviews" : kind === "internal" ? "internalWork" : "tasks");
          return <section key={kind} aria-label={label}>
            <div className={`flex items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-3 py-2 text-xs ${isReview ? "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"}`}>
              <h3 className="flex items-center gap-2 font-semibold"><Icon aria-hidden className="size-4" />{label}<span className="font-normal">· {group.length}</span></h3>
              <span className="shrink-0 tabular-nums">{duration(group.reduce((sum, row) => sum + row.minutes, 0))}</span>
            </div>
            {groupWorkLogRows(group).map(projectStage => <WorkLogGroup key={`${data.date}:${projectStage.key}`} group={projectStage} disabled={editorDisabled}
              onChange={(key, minutes) => { setDirty(true); setRows(current => current.map(row => workLogRowKey(row) === key ? { ...row, minutes } : row)); }}
              onRemove={key => { setDirty(true); setRows(current => current.filter(row => workLogRowKey(row) !== key)); }}
              onAllocate={allocated => {
                const byKey = new Map(allocated.map(row => [workLogRowKey(row), row.minutes]));
                setDirty(true);
                setRows(current => current.map(row => { const minutes = byKey.get(workLogRowKey(row)); return minutes === undefined ? row : { ...row, minutes }; }));
              }} />)}
          </section>;
        }) : <p className="text-sm text-[var(--ui-text-muted)]">{t("empty")}</p>}
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" disabled={saving || !available.length} aria-expanded={adding} onClick={() => { setAdding(value => !value); setAddingOthers(false); }}><Plus aria-hidden className="mr-1 size-4" />{t("addWork")}</Button>
          {data.canLogInternalWork ? <Button type="button" variant="ghost" size="sm"
            disabled={editorDisabled || rows.some(row => row.internal_activity_type === "team_walkthrough")}
            onClick={() => {
              setDirty(true);
              setRows(current => [...current, { activity_kind: "internal", internal_activity_type: "team_walkthrough", task_id: null,
                review_round_id: null, minutes: 0, projectId: null, stage: null, stageName: null, title: null, projectName: null, roundNumber: null }]);
            }}><Plus aria-hidden className="mr-1 size-4" />{t("internalWork")}</Button> : null}
          <div aria-hidden={!adding} inert={!adding} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${adding ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden"><div className="space-y-2">
              {addingOthers ? <p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("otherStudioTasks")}</p> : null}
              {choices.length ? <Select key={addingOthers ? "other" : "personal"} aria-label={t("chooseWork")} placeholder={t("chooseWork")} searchPlaceholder={t("searchWork")} searchEmptyMessage={t("noSearchResults")} value="" disabled={saving || !adding} onValueChange={key => {
                const row = choices.find(item => workLogRowKey(item) === key);
                if (!row) return;
                setRows(current => [...current, row]);
                setAdding(false);
              }}>{choices.map(row => <SelectItem key={workLogRowKey(row)} value={workLogRowKey(row)}>{row.review_round_id ? `${t("reviewRound", { number: row.roundNumber ?? "?" })} · ` : ""}{row.title} · {row.projectName}</SelectItem>)}</Select>
                : <p className="text-sm text-[var(--ui-text-muted)]">{t("noAdditionalWork")}</p>}
              {otherWork.length || addingOthers ? <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setAddingOthers(value => !value)}>{t(addingOthers ? "yourWork" : "otherStudioTasks")}</Button> : null}
            </div></div>
          </div>
        </div>
        {data.calendar.categories.length ? <section aria-label={t("calendar")} className="space-y-2 border-t border-[var(--ui-border)] pt-3">
          <p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("calendar")}</p>
          {data.calendar.categories.map(category => <p key={category.eventType} className="flex justify-between gap-3 text-xs text-[var(--ui-text-muted)]"><span>{t(`event_${category.eventType}`)}</span><span className="whitespace-nowrap tabular-nums">{category.minutes ? duration(category.minutes) : t("allDay")}</span></p>)}
          <p className="text-[11px] text-[var(--ui-text-muted)]">{t("calendarSource")}</p>
        </section> : null}
      </div> : null}
      {visibleError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{visibleError}<Button type="button" size="sm" variant="ghost" disabled={saving || dirty} onClick={() => setAttempt(value => value + 1)}>{t("retry")}</Button></p> : null}
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
      <div className="space-y-1">
        <p className="text-sm"><span className="text-[var(--ui-text-muted)]">{t("total")} </span><strong className="font-semibold tabular-nums" data-work-log-total>{duration(total.totalMinutes)}</strong></p>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("weeklyTotal")} <span className="tabular-nums" data-work-log-week-total>{duration(visibleWeek?.totals.totalMinutes ?? 0)}</span></p>
      </div>
      <Button type="button" size="sm" disabled={!data || editorDisabled} onClick={() => void save()}>{saving ? t("saving") : catchUpDates.length ? t("saveAndContinue") : t("save")}</Button>
    </footer>
  </Dialog>;
}
