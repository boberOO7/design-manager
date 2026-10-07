"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ListTodo, Plus, ShieldCheck, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { instantToDateOnly } from "@/lib/calendar";
import { dailyWorkLogSchema, summarizeLoggedTime, workLogInputSchema, workLogRowKey } from "@/lib/work-log";
import type { DailyWorkLog } from "@/data/queries/work-log";

export function WorkLogDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("WorkLog");
  const locale = useLocale();
  const router = useRouter();
  const [date, setDate] = useState(() => instantToDateOnly(new Date().toISOString()));
  const [data, setData] = useState<DailyWorkLog | null>(null);
  const [rows, setRows] = useState<DailyWorkLog["rows"]>([]);
  const [adding, setAdding] = useState(false);
  const [addingOthers, setAddingOthers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const duration = (minutes: number) => t("duration", { hours: Math.floor(Math.round(minutes) / 60), minutes: Math.round(minutes) % 60 });

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setAdding(false); setAddingOthers(false); setDirty(false);
    void fetch(`/api/work-log?date=${date}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unable to load log");
      const log = dailyWorkLogSchema.parse(await response.json());
      if (!controller.signal.aborted) {
        setData(log);
        setRows(log.rows);
      }
    }).catch(() => { if (!controller.signal.aborted) setError(t("loadFailed")); });
    return () => controller.abort();
  }, [date, attempt, t]);

  const total = summarizeLoggedTime(rows, data?.calendar.minutes ?? 0);
  const available: DailyWorkLog["rows"] = data ? [
    ...data.activeTasks.map(task => ({ activity_kind: "task" as const, task_id: task.id, review_round_id: null,
      minutes: 0, title: task.title, projectName: task.projectName, roundNumber: null })),
    ...data.additionalReviews,
  ].filter(row => !rows.some(current => workLogRowKey(current) === workLogRowKey(row))) : [];
  const personalTaskIds = new Set(data?.activeTasks.filter(task => task.isParticipating).map(task => task.id));
  const personalWork = available.filter(row => row.activity_kind === "review" || personalTaskIds.has(row.task_id));
  const otherWork = available.filter(row => row.activity_kind === "task" && !personalTaskIds.has(row.task_id));
  const choices = addingOthers ? otherWork : personalWork;

  async function save() {
    if (!data || saving) return;
    const input = workLogInputSchema.safeParse({ date, entries: rows.filter(row => row.minutes > 0).map(row => ({
      activity_kind: row.activity_kind, task_id: row.task_id, review_round_id: row.review_round_id, minutes: row.minutes,
    })) });
    if (!input.success) { setError(t("durationInvalid")); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/work-log", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      if (!response.ok) throw new Error("Save failed");
      router.refresh(); onClose();
    } catch { setError(t("saveFailed")); setSaving(false); }
  }

  return <Dialog isOpen title={t("title")} closeLabel={t("close")} closeDisabled={saving}
    onRequestClose={() => { if (!saving) onClose(); }} className="max-w-xl sm:max-h-[80dvh]">
    <div className="shrink-0 border-b border-[var(--ui-border-subtle)] px-4 py-3 sm:px-6">
      <label className="flex items-center gap-3 text-sm text-[var(--ui-text-secondary)]">{t("date")}
        <Input type="date" aria-label={t("date")} className="w-auto" value={date} disabled={saving || dirty} onChange={event => { if (event.target.value) setDate(event.target.value); }} />
      </label>
    </div>
    <div data-work-log-scroll className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
      {!data && !error ? <p role="status" className="text-sm text-[var(--ui-text-muted)]">{t("loading")}</p> : null}
      {data ? <>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("durationHint")}</p>
        {rows.length ? (["task", "review"] as const).map(kind => {
          const group = rows.filter(row => row.activity_kind === kind);
          if (!group.length) return null;
          const isReview = kind === "review";
          const Icon = isReview ? ShieldCheck : ListTodo;
          const label = t(isReview ? "reviews" : "tasks");
          return <section key={kind} aria-label={label}>
            <div className={`flex items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-3 py-2 text-xs ${isReview ? "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]" : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"}`}>
              <h3 className="flex items-center gap-2 font-semibold"><Icon aria-hidden className="size-4" />{label}<span className="font-normal">· {group.length}</span></h3>
              <span className="shrink-0 tabular-nums">{duration(group.reduce((sum, row) => sum + row.minutes, 0))}</span>
            </div>
            <ul className="divide-y divide-[var(--ui-border-subtle)]">{group.map(row => <li key={workLogRowKey(row)} data-work-log-row={workLogRowKey(row)} className="flex items-center gap-2 py-3 sm:gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-2 text-sm font-medium" title={row.title ?? t("unavailableTask")}>{row.title ?? t("unavailableTask")}</p>
                <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--ui-text-muted)]">
                  {isReview ? <span className="shrink-0 rounded bg-[var(--ui-info-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ui-info-text)]">{t("reviewRound", { number: row.roundNumber ?? "?" })}</span> : null}
                  <span className="truncate">{row.projectName}</span>
                </div>
              </div>
              <TimePicker mode="duration" locale={locale} className={`w-28 shrink-0 gap-2 tabular-nums ${row.minutes === 0 ? "text-[var(--ui-text-muted)] [&>span]:font-normal" : ""}`} disabled={saving} data-work-log-duration
                value={`${String(Math.floor(row.minutes / 60)).padStart(2, "0")}:${String(row.minutes % 60).padStart(2, "0")}`}
                aria-label={t("durationFor", { activity: `${isReview ? t("reviewRound", { number: row.roundNumber ?? "?" }) + ": " : ""}${row.title ?? t("unavailableTask")}` })}
                onValueChange={value => {
                  const [hours, minutes] = value.split(":").map(Number);
                  setDirty(true);
                  setRows(current => current.map(item => workLogRowKey(item) === workLogRowKey(row) ? { ...item, minutes: hours * 60 + minutes } : item));
                }} />
              <button type="button" disabled={saving} aria-label={t("remove", { activity: `${isReview ? t("reviewRound", { number: row.roundNumber ?? "?" }) + ": " : ""}${row.title ?? t("unavailableTask")}` })} className="flex size-8 shrink-0 items-center justify-center rounded text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
                onClick={() => { setDirty(true); setRows(current => current.filter(item => workLogRowKey(item) !== workLogRowKey(row))); }}><X aria-hidden className="size-4" /></button>
            </li>)}</ul>
          </section>;
        }) : <p className="text-sm text-[var(--ui-text-muted)]">{t("empty")}</p>}
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" disabled={saving || !available.length} aria-expanded={adding} onClick={() => { setAdding(value => !value); setAddingOthers(false); }}><Plus aria-hidden className="mr-1 size-4" />{t("addWork")}</Button>
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
      </> : null}
      {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}{!data ? <Button type="button" size="sm" variant="ghost" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</Button> : null}</p> : null}
    </div>
    <footer className="flex items-center justify-between gap-4 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
      <p className="text-sm"><span className="text-[var(--ui-text-muted)]">{t("total")} </span><strong className="font-semibold tabular-nums" data-work-log-total>{duration(total.totalMinutes)}</strong></p>
      <Button type="button" size="sm" disabled={!data || saving} onClick={() => void save()}>{saving ? t("saving") : t("save")}</Button>
    </footer>
  </Dialog>;
}
