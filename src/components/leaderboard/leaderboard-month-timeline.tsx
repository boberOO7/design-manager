"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LeaderboardMonthRange } from "@/lib/productivity";
import { cn } from "@/lib/utils";

type Endpoint = keyof LeaderboardMonthRange;

function monthIndex(month: string) {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

function monthValue(index: number) {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function sameRange(left: LeaderboardMonthRange, right: LeaderboardMonthRange) {
  return left.from === right.from && left.through === right.through;
}

function selectionWindow(range: LeaderboardMonthRange, endpoint: Endpoint) {
  const from = monthIndex(range.from);
  const through = monthIndex(range.through);
  const start = Math.floor(from / 12) === Math.floor(through / 12) ? Math.floor(from / 12) * 12
    : through - from < 12 ? from - Math.floor((11 - (through - from)) / 2)
      : Math.floor(monthIndex(range[endpoint]) / 12) * 12;
  return Math.max(12, Math.min(9999 * 12, start));
}

const controlClass = "rounded-[var(--ui-radius-control)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none";

export function LeaderboardMonthTimeline({ value, locale, onCommit }: { value: LeaderboardMonthRange; locale: string; onCommit: (range: LeaderboardMonthRange) => void }) {
  const t = useTranslations("Leaderboard");
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const pointerRef = useRef<number | null>(null);
  const keyboardRef = useRef(false);
  const [activeEndpoint, setActiveEndpoint] = useState<Endpoint>("from");
  const [windowStart, setWindowStart] = useState(() => selectionWindow(value, "from"));
  const bounds = { first: windowStart, last: windowStart + 11 };
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monthLabel = (index: number) => monthFormatter.format(new Date(`${monthValue(index)}-01T12:00:00.000Z`)).replace(/\.$/u, "");
  const fullLabel = (index: number) => `${monthLabel(index)} ${Math.floor(index / 12)}`;
  const from = monthIndex(draft.from);
  const through = monthIndex(draft.through);
  const position = (index: number) => (index - bounds.first) / (bounds.last - bounds.first) * 100;
  const isVisible = (index: number) => index >= bounds.first && index <= bounds.last;
  const visibleFrom = Math.max(from, bounds.first);
  const visibleThrough = Math.min(through, bounds.last);

  // Server navigation restores the URL range; acknowledgements of our own commits
  // leave the viewport and focus in place while the ranking refreshes.
  useEffect(() => {
    if (sameRange(value, committedRef.current)) return;
    committedRef.current = value;
    draftRef.current = value;
    pointerRef.current = null;
    keyboardRef.current = false;
    setDraft(value);
    setActiveEndpoint("from");
    setWindowStart(selectionWindow(value, "from"));
  }, [value]);

  function preview(endpoint: Endpoint, requestedIndex: number) {
    const current = draftRef.current;
    const index = Math.max(12, Math.min(9999 * 12 + 11, endpoint === "from" ? Math.min(requestedIndex, monthIndex(current.through)) : Math.max(requestedIndex, monthIndex(current.from))));
    const next = { ...current, [endpoint]: monthValue(index) };
    draftRef.current = next;
    setDraft(next);
    return next;
  }

  function commit(range = draftRef.current) {
    if (sameRange(range, committedRef.current)) return;
    committedRef.current = range;
    onCommit(range);
  }

  function cancelPointer() {
    pointerRef.current = null;
    draftRef.current = committedRef.current;
    setDraft(committedRef.current);
  }

  function adjustWithKeyboard(event: KeyboardEvent<HTMLElement>, endpoint: Endpoint) {
    const current = monthIndex(draftRef.current[endpoint]);
    const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 1
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 1
        : event.key === "PageDown" ? current - 12
          : event.key === "PageUp" ? current + 12
            : event.key === "Home" ? bounds.first
              : event.key === "End" ? bounds.last : null;
    if (next === null) return;
    event.preventDefault();
    keyboardRef.current = true;
    setActiveEndpoint(endpoint);
    const range = preview(endpoint, next);
    const index = monthIndex(range[endpoint]);
    if (index < bounds.first) setWindowStart(Math.max(12, index));
    else if (index > bounds.last) setWindowStart(Math.min(9999 * 12, index - 11));
  }

  function finishKeyboard() {
    if (!keyboardRef.current) return;
    keyboardRef.current = false;
    commit();
  }

  return <div>
    <div className="grid grid-cols-2 gap-2">
      {(["from", "through"] as const).map((endpoint) => <button key={endpoint} type="button" aria-pressed={activeEndpoint === endpoint} data-endpoint={endpoint} className={cn(controlClass, "min-w-0 px-2 py-1.5 text-left", activeEndpoint === endpoint ? "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]")} onClick={() => setActiveEndpoint(endpoint)} onKeyDown={(event) => adjustWithKeyboard(event, endpoint)} onKeyUp={finishKeyboard} onBlur={finishKeyboard}>
        <span className="block text-xs">{t(endpoint === "from" ? "rangeStart" : "rangeEnd")}</span>
        <span className="mt-0.5 flex items-center justify-between gap-1 text-sm font-semibold capitalize tabular-nums"><span className="truncate">{fullLabel(monthIndex(draft[endpoint]))}</span>{!isVisible(monthIndex(draft[endpoint])) ? <span title={t("outsideTimeline")} className="shrink-0 text-[var(--ui-text-muted)]">{monthIndex(draft[endpoint]) < bounds.first ? <ChevronLeft aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}<span className="sr-only">{t("outsideTimeline")}</span></span> : null}</span>
      </button>)}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
      <p className="text-[var(--ui-text-muted)]">{t("viewingMonths")}</p>
      <button type="button" onClick={() => setWindowStart(selectionWindow(draftRef.current, activeEndpoint))} className={cn(controlClass, "min-h-8 px-2 font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]")}>{t("recenterRange")}</button>
    </div>
    <div className="flex items-center justify-between gap-1">
      <button type="button" aria-label={t("previousYear")} disabled={bounds.first <= 12} onClick={() => setWindowStart(Math.max(12, windowStart - 12))} className={cn(controlClass, "flex size-9 shrink-0 items-center justify-center text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] disabled:opacity-40")}><ChevronLeft aria-hidden="true" className="size-4" /></button>
      <p aria-live="polite" className="text-center text-xs font-semibold capitalize tabular-nums">{fullLabel(bounds.first)} – {fullLabel(bounds.last)}</p>
      <button type="button" aria-label={t("nextYear")} disabled={bounds.last >= 9999 * 12 + 11} onClick={() => setWindowStart(Math.min(9999 * 12, windowStart + 12))} className={cn(controlClass, "flex size-9 shrink-0 items-center justify-center text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] disabled:opacity-40")}><ChevronRight aria-hidden="true" className="size-4" /></button>
    </div>
    <div className="mt-3 px-2">
      <div className="relative h-14" data-month-timeline data-window-start={monthValue(bounds.first)} data-window-end={monthValue(bounds.last)}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-7 h-1 -translate-y-1/2 rounded-full bg-[var(--ui-border-strong)]">
          {visibleFrom <= visibleThrough ? <><div className="absolute h-full rounded-full bg-[var(--ui-action-primary)]" style={{ left: `${position(visibleFrom)}%`, width: `${position(visibleThrough) - position(visibleFrom)}%`, minWidth: 2 }} />{from < bounds.first ? <ChevronLeft className="absolute -left-2 -top-1.5 size-4 text-[var(--ui-action-primary)]" /> : null}{through > bounds.last ? <ChevronRight className="absolute -right-2 -top-1.5 size-4 text-[var(--ui-action-primary)]" /> : null}</> : null}
          {([from, through] as const).map((index, handle) => isVisible(index) ? <span key={handle} className={cn("absolute w-0.5 bg-[var(--ui-action-primary)]", handle === 0 ? "bottom-0 h-3" : "top-0 h-3")} style={{ left: `${position(index)}%` }} /> : null)}
        </div>
        {(["from", "through"] as const).map((endpoint) => isVisible(monthIndex(draft[endpoint])) ? <input key={endpoint} type="range" step={1} min={bounds.first} max={bounds.last} value={monthIndex(draft[endpoint])} aria-label={t(endpoint === "from" ? "rangeStart" : "rangeEnd")} aria-valuetext={fullLabel(monthIndex(draft[endpoint]))} aria-valuemin={endpoint === "through" ? Math.max(from, bounds.first) : bounds.first} aria-valuemax={endpoint === "from" ? Math.min(through, bounds.last) : bounds.last} className={cn("leaderboard-month-slider absolute inset-x-0 w-full touch-none", endpoint === "from" ? "top-0" : "bottom-0")} onFocus={() => setActiveEndpoint(endpoint)} onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          pointerRef.current = event.pointerId;
          setActiveEndpoint(endpoint);
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onChange={(event) => {
          const next = preview(endpoint, Number(event.target.value));
          if (pointerRef.current === null && !keyboardRef.current) commit(next);
        }} onPointerUp={(event) => {
          if (pointerRef.current !== event.pointerId) return;
          pointerRef.current = null;
          commit();
        }} onPointerCancel={cancelPointer} onLostPointerCapture={() => {
          if (pointerRef.current === null) return;
          pointerRef.current = null;
          commit();
        }} onKeyDown={(event) => adjustWithKeyboard(event, endpoint)} onKeyUp={finishKeyboard} onBlur={() => {
          if (pointerRef.current !== null) return;
          finishKeyboard();
        }} /> : null)}
      </div>
    </div>
    <div className="overflow-x-auto overscroll-x-contain">
    <div className="grid min-w-[21rem] grid-cols-12 gap-0.5" role="group" aria-label={`${t(activeEndpoint === "from" ? "rangeStart" : "rangeEnd")} · ${fullLabel(bounds.first)} – ${fullLabel(bounds.last)}`}>
      {Array.from({ length: 12 }, (_, month) => {
        const index = bounds.first + month;
        const selected = index >= from && index <= through;
        const boundary = index === from || index === through;
        const unavailable = activeEndpoint === "from" ? index > through : index < from;
        return <button key={month} type="button" aria-label={fullLabel(index)} aria-pressed={selected} disabled={unavailable} onClick={() => commit(preview(activeEndpoint, index))} className={cn(controlClass, "min-h-10 min-w-0 px-0.5 text-[10px] font-medium capitalize disabled:cursor-not-allowed disabled:opacity-40", boundary ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : selected ? "bg-[var(--ui-focus-soft)] text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]")}>
          <span className="block">{monthLabel(index)}</span>{month === 0 || index % 12 === 0 ? <span className="block text-[9px] tabular-nums">{Math.floor(index / 12)}</span> : null}
        </button>;
      })}
    </div>
    </div>
    <p className="mt-2 px-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("timelineHint")}</p>
  </div>;
}
