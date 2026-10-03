"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { APPLICATION_TIME_ZONE } from "@/lib/calendar";
import type { ProfileHeatmap } from "@/lib/employee-profile";
import styles from "./employee-profile-heatmap.module.css";

type Day = ProfileHeatmap["weeks"][number][number];

export function EmployeeProfileHeatmap({ heatmap }: { heatmap: ProfileHeatmap }) {
  const t = useTranslations("EmployeeProfile");
  const locale = useLocale();
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const [focusedDate, setFocusedDate] = useState(heatmap.end);
  const [selected, setSelected] = useState<{ day: Day; left: number; top: number } | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: APPLICATION_TIME_ZONE });
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: APPLICATION_TIME_ZONE });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: APPLICATION_TIME_ZONE });
  const format = (day: string) => date.format(new Date(`${day}T12:00:00Z`));
  const explanation = (day: Day) => {
    switch (day.kind) {
      case "before_joining": return t("heatmapBeforeJoining");
      case "future": return t("heatmapFuture");
      case "time_off": return t("heatmapTimeOff");
      case "studio_day_off": return t("heatmapStudioDayOff");
      case "weekend": return t("heatmapWeekend");
      default: return "";
    }
  };
  const excluded = (day: Day) => day.kind === "before_joining" || day.kind === "future";
  const label = (day: Day) => `${format(day.date)}${excluded(day) ? "" : ` · ${t("heatmapDayCount", { count: day.count })}`}${explanation(day) ? ` · ${explanation(day)}` : ""}`;
  const select = (day: Day, element: HTMLButtonElement) => {
    const box = element.getBoundingClientRect();
    setSelected({ day, left: Math.max(132, Math.min(window.innerWidth - 132, box.left + box.width / 2)), top: box.top > 90 ? box.top - 8 : box.bottom + 64 });
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, day: Day) => {
    if (event.key === "Escape") { setSelected(null); return; }
    const days = heatmap.weeks.flat();
    const index = days.findIndex((entry) => entry.date === day.date);
    const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    const next = event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : offset === undefined ? null : Math.max(0, Math.min(days.length - 1, index + offset));
    if (next === null) return;
    event.preventDefault();
    cells.current.get(days[next].date)?.focus();
  };

  return <div className={styles.canvas}>
    <div className={styles.calendar}>
      <div aria-hidden="true" className={styles.weekdays}>{heatmap.weeks[0].map((day, index) => <span key={day.date}>{index % 2 === 0 ? weekday.format(new Date(`${day.date}T12:00:00Z`)) : ""}</span>)}</div>
      <div className={styles.plot} role="region" aria-label={t("heatmapCalendar")}>
      <div className={styles.quarters}>{Array.from({ length: 4 }, (_, quarter) => {
        const weeks = heatmap.weeks.slice(quarter * 13, quarter * 13 + 13);
        return <div className={styles.quarter} key={weeks[0][0].date} role="group" aria-label={`${format(weeks[0][0].date)} — ${format(weeks[12][6].date)}`}>
          <div className={styles.months} aria-hidden="true">{weeks.map((week, index) => <span className={styles.month} key={week[0].date}>{(quarter === 0 && index === 0) || week.some((day) => day.date.endsWith("-01")) ? month.format(new Date(`${week.find((day) => day.date.endsWith("-01"))?.date ?? week[0].date}T12:00:00Z`)) : ""}</span>)}</div>
          <div className={styles.weeks}>{weeks.map((week) => <div className={styles.week} key={week[0].date}>{week.map((day) => <button
            key={day.date} type="button" ref={(element) => { if (element) cells.current.set(day.date, element); else cells.current.delete(day.date); }}
            className={styles.cell} data-date={day.date} data-kind={day.kind} data-level={day.level}
            tabIndex={focusedDate === day.date ? 0 : -1} aria-label={label(day)} aria-describedby={selected?.day.date === day.date ? "profile-heatmap-tooltip" : undefined}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") select(day, event.currentTarget); }}
            onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setSelected(null); }}
            onFocus={(event) => { setFocusedDate(day.date); select(day, event.currentTarget); }} onBlur={() => setSelected(null)}
            onClick={(event) => select(day, event.currentTarget)} onKeyDown={(event) => navigate(event, day)}
          />)}</div>)}</div>
        </div>;
      })}</div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-[var(--ui-text-muted)]">
      <div className="flex flex-wrap gap-x-4 gap-y-2">{[
        { kind: "weekend", label: t("heatmapLegendWeekends") },
        { kind: "time_off", label: t("heatmapLegendDaysOff") },
        { kind: "before_joining", label: t("heatmapLegendOutsidePeriod") },
      ].map((entry) => <span key={entry.kind} className="inline-flex items-center gap-1.5"><span aria-hidden="true" data-level="0" data-kind={entry.kind} className={`${styles.cell} ${styles.legendCell}`} />{entry.label}</span>)}</div>
      <div className="flex items-center gap-1.5" aria-label={t("heatmapIntensity")}><span className="mr-1">{t("heatmapLess")}</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} aria-hidden="true" data-level={level} className={`${styles.cell} ${styles.legendCell}`} />)}<span className="ml-1">{t("heatmapMore")}</span></div>
    </div>
    {selected ? createPortal(<div id="profile-heatmap-tooltip" role="tooltip" className="pointer-events-none fixed z-50 w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-center text-xs leading-5 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]" style={{ left: selected.left, top: selected.top }}>
      <p className="font-medium">{format(selected.day.date)}</p>{!excluded(selected.day) ? <p className="text-[var(--ui-text-secondary)]">{t("heatmapDayCount", { count: selected.day.count })}</p> : null}{explanation(selected.day) ? <p className="text-[var(--ui-text-muted)]">{explanation(selected.day)}</p> : null}
    </div>, document.body) : null}
  </div>;
}
