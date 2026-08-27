"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
type CalendarView = "day" | "month" | "year";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfMonday(value: Date) {
  const start = new Date(value);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function monthDates(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = startOfMonday(first);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function monthLabel(date: Date, locale: string, width: "long" | "short" = "long") {
  const month = new Intl.DateTimeFormat(locale, { month: width }).format(date);
  return locale.startsWith("uk") ? month.replace(/\.$/u, "") : month;
}

function monthYearLabel(date: Date, locale: string) {
  if (locale.startsWith("uk")) return `${monthLabel(date, locale)} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function yearRangeStart(year: number) {
  return Math.floor(year / 12) * 12;
}

function labels(locale: string) {
  return locale.startsWith("uk")
    ? { clear: "Очистити", next: "Наступний", previous: "Попередній", today: "Сьогодні", chooseDate: "Вибрати дату", chooseMonth: "Вибрати місяць", chooseYear: "Вибрати рік", dayView: "Перегляд днів", monthView: "Перегляд місяців", yearView: "Перегляд років" }
    : { clear: "Clear", next: "Next", previous: "Previous", today: "Today", chooseDate: "Choose date", chooseMonth: "Choose month", chooseYear: "Choose year", dayView: "Day view", monthView: "Month view", yearView: "Year view" };
}

export const datePickerClassName = "flex h-11 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-left text-sm text-[var(--ui-text)] transition-[border-color,background-color,box-shadow] hover:border-[var(--ui-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60";

export type DatePickerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "defaultValue" | "onChange" | "value"> & {
  defaultValue?: string;
  invalid?: boolean;
  locale?: string;
  min?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
};

export function DatePicker({ className, defaultValue = "", disabled, invalid = false, locale = "en", min, name, onValueChange, placeholder, value, ...buttonProps }: DatePickerProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const selectedValue = value ?? internalValue;
  const selectedDate = DATE_ONLY.test(selectedValue) ? parseDate(selectedValue) : null;
  const [viewDate, setViewDate] = React.useState(() => selectedDate ?? new Date());
  const [calendarView, setCalendarView] = React.useState<CalendarView>("day");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerNode, setTriggerNode] = React.useState<HTMLButtonElement | null>(null);
  const copy = labels(locale);
  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }), [locale]);
  const weekdayFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short" }), [locale]);
  const weekdays = React.useMemo(() => monthDates(new Date(2024, 0, 1)).slice(0, 7).map((date) => weekdayFormatter.format(date)), [weekdayFormatter]);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;

  React.useEffect(() => {
    const form = triggerRef.current?.closest("form");
    if (!form || value !== undefined) return;
    const reset = () => setInternalValue(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  function setDate(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  function changeViewRange(offset: number) {
    setViewDate((current) => {
      if (calendarView === "day") return new Date(current.getFullYear(), current.getMonth() + offset, 1, 12);
      return new Date(current.getFullYear() + (calendarView === "month" ? offset : offset * 12), current.getMonth(), 1, 12);
    });
  }

  const today = toDateOnly(new Date());
  const minValue = min && DATE_ONLY.test(min) ? min : undefined;
  const visibleDates = monthDates(viewDate);
  const currentYear = viewDate.getFullYear();
  const rangeStart = yearRangeStart(currentYear);
  const monthYear = monthYearLabel(viewDate, locale);
  const months = Array.from({ length: 12 }, (_, month) => new Date(currentYear, month, 1, 12));
  const years = Array.from({ length: 12 }, (_, index) => rangeStart + index);
  const isMonthAvailable = (date: Date) => !minValue || toDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)) >= minValue;
  const isYearAvailable = (year: number) => !minValue || year >= Number(minValue.slice(0, 4));
  const rangeLabel = `${rangeStart}–${rangeStart + 11}`;
  const currentRangeLabel = calendarView === "day" ? monthYear : calendarView === "month" ? String(currentYear) : rangeLabel;

  return <Popover.Root open={open} onOpenChange={(nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setViewDate(selectedDate ?? new Date());
      setCalendarView("day");
    }
  }}>
    {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
    <Popover.Trigger asChild>
      <button ref={(node) => { triggerRef.current = node; setTriggerNode(node); }} type="button" disabled={disabled} data-invalid={invalid || undefined} aria-label={buttonProps["aria-label"] ?? copy.chooseDate} className={cn(datePickerClassName, invalid && "border-[var(--ui-danger-border)]", className)} {...buttonProps}>
        <span className={cn("truncate", !selectedDate && "text-[var(--ui-text-muted)]")}>{selectedDate ? dateFormatter.format(selectedDate) : placeholder ?? ""}</span>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-secondary)]" strokeWidth={1.8} />
      </button>
    </Popover.Trigger>
    <Popover.Portal container={portalContainer}>
      <Popover.Content align="start" sideOffset={6} collisionPadding={8} className="z-[80] w-[min(20rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="mb-3 flex items-center justify-between gap-1">
          <button type="button" aria-label={`${copy.previous} ${currentRangeLabel}`} className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => changeViewRange(-1)}><ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} /></button>
          {calendarView === "day" ? <button type="button" aria-label={copy.chooseMonth} aria-live="polite" className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-semibold capitalize transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => setCalendarView("month")}>{monthYear}</button> : calendarView === "month" ? <button type="button" aria-label={copy.chooseYear} aria-live="polite" className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-semibold transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => setCalendarView("year")}>{currentYear}</button> : <p aria-live="polite" className="min-h-9 px-2 pt-2 text-sm font-semibold">{rangeLabel}</p>}
          <button type="button" aria-label={`${copy.next} ${currentRangeLabel}`} className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => changeViewRange(1)}><ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} /></button>
        </div>
        {calendarView === "day" ? <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={`${copy.dayView}: ${monthYear}`}>
          {weekdays.map((day) => <span key={day} className="flex h-8 items-center justify-center text-[11px] font-medium text-[var(--ui-text-muted)]" aria-hidden="true">{day}</span>)}
          {visibleDates.map((date) => {
            const dateValue = toDateOnly(date);
            const isCurrentMonth = date.getMonth() === viewDate.getMonth();
            const isSelected = dateValue === selectedValue;
            const isToday = dateValue === today;
            const unavailable = Boolean(minValue && dateValue < minValue);
            return <button key={dateValue} type="button" role="gridcell" disabled={unavailable} aria-current={isToday ? "date" : undefined} aria-selected={isSelected} className={cn("mx-auto flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", !isCurrentMonth && "text-[var(--ui-text-subtle)]", isToday && !isSelected && "ring-1 ring-inset ring-[var(--ui-border-strong)]", isSelected && "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]", !isSelected && !unavailable && "hover:bg-[var(--ui-surface-muted)]", unavailable && "cursor-not-allowed text-[var(--ui-text-subtle)] opacity-45")} onClick={() => setDate(dateValue)}>{date.getDate()}</button>;
          })}
        </div> : calendarView === "month" ? <div className="grid grid-cols-3 gap-1" role="grid" aria-label={`${copy.monthView}: ${currentYear}`}>
          {months.map((month) => {
            const unavailable = !isMonthAvailable(month);
            const isSelected = selectedDate?.getFullYear() === currentYear && selectedDate.getMonth() === month.getMonth();
            return <button key={month.getMonth()} type="button" role="gridcell" disabled={unavailable} aria-selected={isSelected} className={cn("flex h-10 items-center justify-center rounded-[var(--ui-radius-control)] px-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", isSelected && "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]", !isSelected && !unavailable && "hover:bg-[var(--ui-surface-muted)]", unavailable && "cursor-not-allowed text-[var(--ui-text-subtle)] opacity-45")} onClick={() => { setViewDate(month); setCalendarView("day"); }}>{monthLabel(month, locale, "short")}</button>;
          })}
        </div> : <div className="grid grid-cols-3 gap-1" role="grid" aria-label={`${copy.yearView}: ${rangeLabel}`}>
          {years.map((year) => {
            const unavailable = !isYearAvailable(year);
            const isSelected = selectedDate?.getFullYear() === year;
            return <button key={year} type="button" role="gridcell" disabled={unavailable} aria-selected={isSelected} className={cn("flex h-10 items-center justify-center rounded-[var(--ui-radius-control)] px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", isSelected && "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]", !isSelected && !unavailable && "hover:bg-[var(--ui-surface-muted)]", unavailable && "cursor-not-allowed text-[var(--ui-text-subtle)] opacity-45")} onClick={() => { setViewDate((current) => new Date(year, current.getMonth(), 1, 12)); setCalendarView("month"); }}>{year}</button>;
          })}
        </div>}
        <div className="mt-3 flex items-center justify-between border-t border-[var(--ui-border-subtle)] pt-3">
          <button type="button" className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { if (!minValue || today >= minValue) setDate(today); }}>{copy.today}</button>
          <button type="button" disabled={!selectedValue} className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setDate("")}>{copy.clear}</button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
