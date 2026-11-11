"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarOff, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { addCalendarDays, getMonthGrid, parseDateOnly, toDateOnly } from "@/lib/calendar";
import { studioDayOffItem, studioDaysOffDeleteResponseSchema, studioDaysOffResponseSchema } from "@/lib/studio-days-off";
import { studioDayOffPeriodSchema, studioDaysOffCreateSchema } from "@/lib/validation/studio-days-off";
import type { CalendarItem } from "@/types/calendar";

type DayOff = Extract<CalendarItem, { source: "studio_day_off" }>;
type Draft = { id: string | null; name: string; note: string; startDate: string; endDate: string; dates: string[]; mode: "period" | "dates" };
const dayCount = (start: string, end: string) => Math.round((Date.parse(`${end}T12:00Z`) - Date.parse(`${start}T12:00Z`)) / 86_400_000) + 1;

export function StudioDaysOffPanel({ isOpen, onExited, initialDate, items, onClose, onChange }: {
  isOpen: boolean; onExited: () => void; initialDate: string; items: DayOff[]; onClose: () => void;
  onChange: (added: DayOff[], removedIds: string[]) => void;
}) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const router = useRouter();
  const [year, setYear] = useState(Number(initialDate.slice(0, 4)));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [month, setMonth] = useState(`${initialDate.slice(0, 7)}-01`);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const yearItems = useMemo(() => items.filter((item) => item.startDate <= `${year}-12-31` && item.endDate >= `${year}-01-01`)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id)), [items, year]);
  const selectedIds = yearItems.filter((item) => selected.has(item.id)).map((item) => item.id);
  const values = draft ? draft.mode === "period"
    ? { name: draft.name, note: draft.note, startDate: draft.startDate, endDate: draft.endDate }
    : { name: draft.name, note: draft.note, dates: draft.dates } : null;
  const valid = studioDaysOffCreateSchema.safeParse(values).success;
  const validPeriod = draft && studioDayOffPeriodSchema.safeParse({ name: "period", startDate: draft.startDate, endDate: draft.endDate }).success;
  const count = draft ? draft.mode === "dates" ? draft.dates.length : validPeriod ? dayCount(draft.startDate, draft.endDate) : 0 : 0;
  const conflicts = draft ? items.filter((item) => item.id !== draft.id && (draft.mode === "dates"
    ? draft.dates.some((date) => item.startDate <= date && item.endDate >= date)
    : validPeriod && item.startDate <= draft.endDate && item.endDate >= draft.startDate)) : [];
  const title = draft ? t(draft.id ? "dayOffEditTitle" : "dayOffAddTitle") : t("companyDaysOff");

  function label(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
    return new Intl.DateTimeFormat(locale, options).format(parseDateOnly(date));
  }
  function rangeLabel(item: Pick<DayOff, "startDate" | "endDate">) {
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", ...(item.startDate.slice(0, 4) !== item.endDate.slice(0, 4) ? { year: "numeric" } : {}) };
    return item.startDate === item.endDate ? label(item.startDate, options) : `${label(item.startDate, options)} — ${label(item.endDate, options)}`;
  }
  function edit(item?: DayOff) {
    const date = initialDate.startsWith(`${year}-`) ? initialDate : `${year}-01-01`;
    setDraft({ id: item?.id ?? null, name: item?.title ?? "", note: item?.note ?? "", startDate: item?.startDate ?? date,
      endDate: item?.endDate ?? date, dates: [], mode: "period" });
    setMonth(`${(item?.startDate ?? date).slice(0, 7)}-01`);
    setRangeStart(null); setError(""); setNotice("");
  }
  function back() { if (!pending) { setDraft(null); setRangeStart(null); setError(""); } }
  function updateDates(patch: Partial<Pick<Draft, "startDate" | "endDate">>) {
    setDraft((current) => current ? { ...current, ...patch } : null);
    const anchor = patch.startDate || patch.endDate;
    if (anchor) setMonth(`${anchor.slice(0, 7)}-01`);
    setRangeStart(null); setError("");
  }
  function pick(date: string) {
    if (!draft) return;
    if (draft.mode === "dates") setDraft({ ...draft, dates: draft.dates.includes(date) ? draft.dates.filter((value) => value !== date) : [...draft.dates, date].sort() });
    else if (!rangeStart) { setDraft({ ...draft, startDate: date, endDate: date }); setRangeStart(date); }
    else { setDraft({ ...draft, startDate: rangeStart < date ? rangeStart : date, endDate: rangeStart > date ? rangeStart : date }); setRangeStart(null); }
    setError("");
  }
  function moveMonth(delta: number) {
    const date = parseDateOnly(month); date.setMonth(date.getMonth() + delta); setMonth(toDateOnly(date));
  }
  async function save() {
    if (!draft || !valid || conflicts.length || inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      const response = await fetch(draft.id ? `/api/calendar/days-off/${encodeURIComponent(draft.id)}` : "/api/calendar/days-off", {
        method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const result = studioDaysOffResponseSchema.safeParse(await response.json());
      if (!response.ok || !result.success) {
        setError(t(response.status === 409 ? "dayOffConflictChanged" : "dayOffSaveFailed"));
        if (response.status === 409) router.refresh();
        return;
      }
      const added = result.data.daysOff.map(studioDayOffItem);
      onChange(added, []); setYear(Number(added[0]?.startDate.slice(0, 4) ?? year));
      setNotice(t("dayOffSaved")); setDraft(null); setSelected(new Set());
    } catch { setError(t("dayOffSaveFailed")); }
    finally { inFlight.current = false; setPending(false); }
  }
  async function remove() {
    if (!deleteIds?.length || inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/calendar/days-off", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: deleteIds }) });
      const result = studioDaysOffDeleteResponseSchema.safeParse(await response.json());
      if (!response.ok || !result.success) { setError(t("dayOffDeleteFailed")); return; }
      onChange([], result.data.ids); setDeleteIds(null); setSelected(new Set()); setNotice(t("dayOffDeleted"));
    } catch { setError(t("dayOffDeleteFailed")); }
    finally { inFlight.current = false; setPending(false); }
  }

  return <><Drawer isOpen={isOpen} isTopLayer={!deleteIds} onClose={pending ? () => {} : onClose} onExited={onExited}
    title={title} focusKey={draft ? `edit:${draft.id ?? "new"}` : `list:${year}`} initialFocusRef={draft ? nameRef : addRef}
    className="w-full max-w-[34rem] sm:w-[min(34rem,calc(100%-1rem))]">
    <header className="flex items-center gap-3 border-b border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5">
      {draft ? <Button type="button" variant="ghost" disabled={pending} onClick={back} className="size-11 shrink-0 p-0" aria-label={t("dayOffBack")}><ArrowLeft aria-hidden="true" className="size-4" /></Button> : <CalendarOff aria-hidden="true" className="size-5 shrink-0 text-[var(--ui-violet-text)]" />}
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{t("dayOffEyebrow")}</p><h2 className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{title}</h2></div>
      <Button variant="ghost" disabled={pending} onClick={onClose} className="size-11 shrink-0 p-0" aria-label={t("close")}><X aria-hidden="true" className="size-4" /></Button>
    </header>
    <div key={draft ? "editor" : "list"} className="company-days-off-view min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
      {!draft ? <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={pending} className="size-11 p-0" aria-label={t("previousYear")} onClick={() => { setYear(year - 1); setSelected(new Set()); }}><ChevronLeft aria-hidden="true" className="size-4" /></Button>
          <span aria-live="polite" className="font-semibold tabular-nums">{year}</span>
          <Button variant="ghost" size="sm" disabled={pending} className="size-11 p-0" aria-label={t("nextYear")} onClick={() => { setYear(year + 1); setSelected(new Set()); }}><ChevronRight aria-hidden="true" className="size-4" /></Button>
        </div><Button ref={addRef} onClick={() => edit()} className="min-h-11 gap-2"><Plus aria-hidden="true" className="size-4" />{t("dayOffAddTitle")}</Button></div>
        <p className="mb-4 text-sm text-[var(--ui-text-muted)]">{t("dayOffDescription")}</p>
        {yearItems.length ? yearItems.map((item, index) => {
          const visibleStart = item.startDate < `${year}-01-01` ? `${year}-01-01` : item.startDate;
          const previous = yearItems[index - 1];
          const previousMonth = previous ? (previous.startDate < `${year}-01-01` ? `${year}-01-01` : previous.startDate).slice(0, 7) : "";
          return <div key={item.id}>
            {visibleStart.slice(0, 7) !== previousMonth ? <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label(visibleStart, { month: "long" })}</h3> : null}
            <div className="flex items-center gap-3 border-b border-[var(--ui-border-subtle)] py-3">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
                aria-label={t("dayOffSelect", { name: item.title, dates: rangeLabel(item) })} className="size-4 shrink-0 accent-[var(--ui-violet-text)]" />
              <button type="button" onClick={() => edit(item)} aria-label={`${t("editDayOff", { name: item.title })}, ${rangeLabel(item)}`} className="min-h-11 min-w-0 flex-1 rounded-md text-left transition-colors hover:text-[var(--ui-violet-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
                <span className="block break-words text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{rangeLabel(item)}{item.startDate !== item.endDate ? ` · ${t("dayOffDayCount", { count: dayCount(item.startDate, item.endDate) })}` : ""}</span>
                {item.note ? <span className="mt-1 block line-clamp-2 text-xs text-[var(--ui-text-muted)]">{item.note}</span> : null}
              </button>
              {item.startDate !== item.endDate ? <span className="text-xs text-[var(--ui-text-muted)]">{t("dayOffPeriod")}</span> : null}
            </div>
          </div>;
        }) : <p className="py-5 text-sm text-[var(--ui-text-muted)]">{t("noDaysOffForYear", { year })}</p>}
      </> : <form id="studio-days-off-form" onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={pending}>
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <FormField label={t("dayOffName")}><input ref={nameRef} required maxLength={160} className={inputClassName} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>
          {!draft.id ? <SegmentedControl ariaLabel={t("dayOffSelectionMode")} items={[{ value: "period", label: t("dayOffPeriod") }, { value: "dates", label: t("dayOffSeparateDates") }]} value={draft.mode} onValueChange={(mode) => { setDraft({ ...draft, mode }); setRangeStart(null); setError(""); }} className="w-full" /> : null}
          {draft.mode === "period" ? <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("startDate")}><DatePicker locale={locale} value={draft.startDate} onValueChange={(startDate) => updateDates({ startDate, ...(draft.endDate < startDate ? { endDate: startDate } : {}) })} /></FormField>
            <FormField label={t("dayOffLastDate")}><DatePicker locale={locale} value={draft.endDate} min={draft.startDate} onValueChange={(endDate) => updateDates({ endDate })} /></FormField>
          </div> : draft.dates.length ? <p className="text-xs leading-6 text-[var(--ui-text-secondary)]">{draft.dates.map((date) => label(date, { day: "numeric", month: "short" })).join(" · ")}</p> : null}
          <div className="rounded-xl border border-[var(--ui-border)] p-3">
            <div className="mb-2 flex items-center justify-between"><Button type="button" variant="ghost" className="size-11 p-0" aria-label={t("previous")} onClick={() => moveMonth(-1)}><ChevronLeft aria-hidden="true" className="size-4" /></Button><p aria-live="polite" className="text-sm font-semibold capitalize">{label(month, { month: "long", year: "numeric" })}</p><Button type="button" variant="ghost" className="size-11 p-0" aria-label={t("next")} onClick={() => moveMonth(1)}><ChevronRight aria-hidden="true" className="size-4" /></Button></div>
            <div className="grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, index) => <span key={index} className="py-2 text-center text-xs text-[var(--ui-text-muted)]">{label(addCalendarDays("2024-01-01", index), { weekday: "short" })}</span>)}</div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label={t("dayOffChooseDates")}>{getMonthGrid(month).map((date) => {
              const active = draft.mode === "dates" ? draft.dates.includes(date) : Boolean(validPeriod && date >= draft.startDate && date <= draft.endDate);
              const edge = active && (draft.mode === "dates" || date === draft.startDate || date === draft.endDate);
              const exists = items.some((item) => item.id !== draft.id && item.startDate <= date && item.endDate >= date);
              return <button key={date} type="button" aria-pressed={active} aria-label={`${label(date, { day: "numeric", month: "long", year: "numeric" })}${exists ? `, ${t("dayOffAlreadyExists")}` : ""}`} onClick={() => pick(date)}
                className={`relative min-h-10 rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${edge ? "bg-[var(--ui-violet-text)] text-[var(--ui-surface)] font-semibold" : active ? "bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]" : date.slice(0, 7) !== month.slice(0, 7) ? "text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-muted)]" : "text-[var(--ui-text)] hover:bg-[var(--ui-surface-muted)]"}`}>
                {Number(date.slice(-2))}{exists ? <span aria-hidden="true" className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" /> : null}
              </button>;
            })}</div>
            <p className="mt-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("dayOffCalendarHint")}</p>
          </div>
          <p aria-live="polite" className="text-sm font-medium">{count ? t("dayOffSelectedCount", { count }) : t("dayOffChooseDates")}</p>
          <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("dayOffPeriodHint")}</p>
          {conflicts.length ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("dayOffOverlap", { dates: conflicts.map(rangeLabel).join(", ") })}</p> : null}
          <details open={draft.note ? true : undefined}><summary className="cursor-pointer text-sm text-[var(--ui-text-secondary)]">{t("dayOffAddNote")}</summary><FormField label={t("dayOffNote")} className="mt-3"><textarea rows={3} maxLength={2000} className={textareaClassName} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></FormField></details>
        </fieldset>
      </form>}
      {error && !deleteIds ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      <p role="status" className="mt-3 text-sm text-[var(--ui-violet-text)]">{notice}</p>
    </div>
    {draft ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5"><p className="max-w-44 text-xs text-[var(--ui-text-muted)]">{t(draft.mode === "period" ? "dayOffPeriodSavedTogether" : "dayOffDatesSavedSeparately")}</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={back}>{t("cancel")}</Button><Button form="studio-days-off-form" type="submit" disabled={pending || !valid || conflicts.length > 0}>{pending ? t("saving") : t(draft.id ? "dayOffSaveChanges" : "dayOffAddTitle")}</Button></div></footer>
      : selectedIds.length ? <footer className="flex items-center justify-between gap-3 border-t border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5"><span className="text-sm">{t("dayOffSelectedRecords", { count: selectedIds.length })}</span><Button type="button" variant="outline" onClick={() => { setError(""); setDeleteIds(selectedIds); }} className="ui-outline-danger gap-2 text-[var(--ui-danger-text)]"><Trash2 aria-hidden="true" className="size-4" />{t("dayOffDeleteSelected")}</Button></footer> : null}
  </Drawer>
  <Dialog isOpen={deleteIds !== null} title={t("dayOffDeleteSelected")} closeLabel={t("close")} closeDisabled={pending} onRequestClose={() => { if (!pending) { setDeleteIds(null); setError(""); } }}>
    <div className="space-y-4"><p className="text-sm text-[var(--ui-text-secondary)]">{t("dayOffDeleteSelectedConfirm", { count: deleteIds?.length ?? 0 })}</p><ul className="space-y-2 text-sm">{items.filter((item) => deleteIds?.includes(item.id)).map((item) => <li key={item.id}>{item.title}<span className="block text-xs text-[var(--ui-text-muted)]">{rangeLabel(item)}</span></li>)}</ul>
      {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setDeleteIds(null)}>{t("cancel")}</Button><Button variant="outline" disabled={pending} onClick={() => void remove()} className="ui-outline-danger text-[var(--ui-danger-text)]">{pending ? t("saving") : t("dayOffDeleteSelected")}</Button></div>
    </div>
  </Dialog></>;
}
