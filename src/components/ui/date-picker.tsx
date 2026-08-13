"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

function labels(locale: string) {
  return locale.startsWith("uk")
    ? { clear: "Очистити", next: "Наступний місяць", previous: "Попередній місяць", today: "Сьогодні", chooseDate: "Вибрати дату" }
    : { clear: "Clear", next: "Next month", previous: "Previous month", today: "Today", chooseDate: "Choose date" };
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
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerNode, setTriggerNode] = React.useState<HTMLButtonElement | null>(null);
  const copy = labels(locale);
  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }), [locale]);
  const monthFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
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

  function changeMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
  }

  const today = toDateOnly(new Date());
  const minValue = min && DATE_ONLY.test(min) ? min : undefined;
  const visibleDates = monthDates(viewDate);

  return <Popover.Root open={open} onOpenChange={(nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) setViewDate(selectedDate ?? new Date());
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
          <button type="button" aria-label={copy.previous} className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} /></button>
          <p aria-live="polite" className="text-sm font-semibold capitalize">{monthFormatter.format(viewDate)}</p>
          <button type="button" aria-label={copy.next} className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => changeMonth(1)}><ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.8} /></button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={monthFormatter.format(viewDate)}>
          {weekdays.map((day) => <span key={day} className="flex h-8 items-center justify-center text-[11px] font-medium text-[var(--ui-text-muted)]" aria-hidden="true">{day}</span>)}
          {visibleDates.map((date) => {
            const dateValue = toDateOnly(date);
            const isCurrentMonth = date.getMonth() === viewDate.getMonth();
            const isSelected = dateValue === selectedValue;
            const isToday = dateValue === today;
            const unavailable = Boolean(minValue && dateValue < minValue);
            return <button key={dateValue} type="button" role="gridcell" disabled={unavailable} aria-current={isToday ? "date" : undefined} aria-selected={isSelected} className={cn("mx-auto flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", !isCurrentMonth && "text-[var(--ui-text-subtle)]", isToday && !isSelected && "ring-1 ring-inset ring-[var(--ui-border-strong)]", isSelected && "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]", !isSelected && !unavailable && "hover:bg-[var(--ui-surface-muted)]", unavailable && "cursor-not-allowed text-[var(--ui-text-subtle)] opacity-45")} onClick={() => setDate(dateValue)}>{date.getDate()}</button>;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--ui-border-subtle)] pt-3">
          <button type="button" className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { if (!minValue || today >= minValue) setDate(today); }}>{copy.today}</button>
          <button type="button" disabled={!selectedValue} className="min-h-9 rounded-[var(--ui-radius-control)] px-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setDate("")}>{copy.clear}</button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
