"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { parseDateOnly } from "@/lib/calendar";
import { isWorkLogDateEditable, type WeeklyWorkLog } from "@/lib/work-log";
import { Tooltip } from "@/components/ui/tooltip";

export function WorkLogWeek({ week, today, onSelect, activeDate, disabled = false }: {
  week: WeeklyWorkLog; today: string; onSelect: (date: string) => void; activeDate: string; disabled?: boolean;
}) {
  const t = useTranslations("WorkLog");
  const locale = useLocale();
  const duration = (minutes: number) => t("duration", { hours: Math.floor(Math.round(minutes) / 60), minutes: Math.round(minutes) % 60 });
  const format = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return <ul className="grid grid-cols-7" aria-label={t("week")}>
    {week.days.map(day => {
      const future = !isWorkLogDateEditable(day.date, today);
      const dayDisabled = disabled || future;
      const status = t(day.submittedAt ? "completed" : day.kind === "day" ? "notFilled" : `day_${day.kind}`);
      const description = `${format.format(parseDateOnly(day.date))}: ${status} · ${duration(day.totalMinutes)}`;
      const breakdown = `${t("tasks")}: ${duration(day.taskMinutes)} · ${t("reviews")}: ${duration(day.reviewMinutes)}${day.calendarMinutes ? ` · ${t("calendarShort")}: ${duration(day.calendarMinutes)}` : ""}`;
      return <li key={day.date} className={`px-0.5 ${dayDisabled ? "cursor-not-allowed" : ""}`}>
        <Tooltip content={`${description}\n${breakdown}`}><button type="button" data-work-log-day={day.date} disabled={dayDisabled}
          aria-pressed={activeDate === day.date} aria-label={description} onClick={() => onSelect(day.date)}
          className={`flex w-full flex-col items-center gap-1 rounded-[var(--ui-radius-control)] py-2 text-xs transition-colors duration-200 enabled:hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed ${future ? "opacity-40" : ""} ${activeDate === day.date ? "bg-[var(--ui-surface-muted)] ring-1 ring-[var(--ui-border-strong)]" : "text-[var(--ui-text-secondary)]"}`}>
          <span>{weekday.format(parseDateOnly(day.date))}</span>
          <span className="font-semibold">{parseDateOnly(day.date).getDate()}</span>
          <span className="tabular-nums text-[10px] text-[var(--ui-text-muted)]" data-work-log-day-total>{Math.floor(Math.round(day.totalMinutes) / 60)}:{String(Math.round(day.totalMinutes) % 60).padStart(2, "0")}</span>
          <span className="flex h-3 items-center">{day.submittedAt ? <Check aria-hidden className="size-3 text-[var(--ui-success-text)]" /> : day.missing ? <span aria-hidden className="size-1 rounded-full bg-[var(--ui-text-muted)]" /> : null}</span>
        </button></Tooltip>
      </li>;
    })}
  </ul>;
}
