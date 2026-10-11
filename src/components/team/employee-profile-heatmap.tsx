"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Tooltip } from "@/components/ui/tooltip";
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
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, day: Day) => {
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
          <div className={styles.weeks}>{weeks.map((week) => <div className={styles.week} key={week[0].date}>{week.map((day) => <Tooltip key={day.date} openOnClick content={<>
            <p className="font-medium">{format(day.date)}</p>{!excluded(day) ? <p className="text-[var(--ui-text-secondary)]">{t("heatmapDayCount", { count: day.count })}</p> : null}{explanation(day) ? <p className="text-[var(--ui-text-muted)]">{explanation(day)}</p> : null}
          </>}><button
            type="button" ref={(element) => { if (element) cells.current.set(day.date, element); else cells.current.delete(day.date); }}
            className={styles.cell} data-date={day.date} data-kind={day.kind} data-level={day.level}
            tabIndex={focusedDate === day.date ? 0 : -1} aria-label={label(day)}
            onFocus={() => setFocusedDate(day.date)} onKeyDown={(event) => navigate(event, day)}
          /></Tooltip>)}</div>)}</div>
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
  </div>;
}
