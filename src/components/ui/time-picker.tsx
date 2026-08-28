"use client";

import * as Popover from "@radix-ui/react-popover";
import { Clock3 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const TIME_PICKER_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
export const TIME_PICKER_MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
export const TIME_PICKER_ROW_HEIGHT = 40;

const TIME_VALUE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DOM_DELTA_LINE = 1;

function parseTime(value: string) {
  const match = TIME_VALUE.exec(value);
  return { hour: match?.[1] ?? "00", minute: match?.[2] ?? "00" };
}

function scrollToSelected(container: HTMLDivElement | null) {
  const selectedItem = container?.querySelector<HTMLElement>("[data-selected='true']");
  if (!container || !selectedItem) return;

  const selectedRow = Array.from(container.children).indexOf(selectedItem);
  const visibleRows = Math.floor(container.clientHeight / TIME_PICKER_ROW_HEIGHT);
  const maximumRow = Math.floor((container.scrollHeight - container.clientHeight) / TIME_PICKER_ROW_HEIGHT);
  const targetRow = Math.min(Math.max(selectedRow - Math.floor(visibleRows / 2), 0), maximumRow);
  container.scrollTop = targetRow * TIME_PICKER_ROW_HEIGHT;
}

export function isTimePickerDiscreteWheel(deltaY: number, deltaMode: number) {
  return deltaY !== 0 && (deltaMode === DOM_DELTA_LINE || Math.abs(deltaY) >= TIME_PICKER_ROW_HEIGHT);
}

export const timePickerClassName = "flex h-11 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-left text-sm text-[var(--ui-text)] transition-[border-color,background-color,box-shadow] hover:border-[var(--ui-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60 data-[state=open]:border-[var(--ui-focus)] data-[state=open]:bg-[var(--ui-surface-subtle)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--ui-focus)] data-[state=open]:ring-offset-2";

export type TimePickerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "defaultValue" | "onChange" | "value"> & {
  defaultValue?: string;
  locale?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

export function TimePicker({ className, defaultValue = "00:00", disabled, locale = "en", name, onValueChange, value, ...buttonProps }: TimePickerProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerNode, setTriggerNode] = React.useState<HTMLButtonElement | null>(null);
  const hourColumnRef = React.useRef<HTMLDivElement>(null);
  const minuteColumnRef = React.useRef<HTMLDivElement>(null);
  const selectedValue = value ?? internalValue;
  const selected = parseTime(selectedValue);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  const labels = locale.startsWith("uk") ? { chooseTime: "Вибрати час", hours: "Години", minutes: "Хвилини" } : { chooseTime: "Choose time", hours: "Hours", minutes: "Minutes" };

  React.useEffect(() => {
    const form = triggerRef.current?.closest("form");
    if (!form || value !== undefined) return;
    const reset = () => {
      setInternalValue(defaultValue);
      setOpen(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToSelected(hourColumnRef.current);
      scrollToSelected(minuteColumnRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selected.hour, selected.minute]);

  function setTime(hour: string, minute: string) {
    const nextValue = `${hour}:${minute}`;
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return <Popover.Root open={open} onOpenChange={setOpen}>
    {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
    <Popover.Trigger asChild>
      <button ref={(node) => { triggerRef.current = node; setTriggerNode(node); }} type="button" disabled={disabled} className={cn(timePickerClassName, className)} {...buttonProps}>
        <span className="ui-numeric font-medium">{selectedValue}</span>
        <Clock3 aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-secondary)]" strokeWidth={1.8} />
      </button>
    </Popover.Trigger>
    <Popover.Portal container={portalContainer}>
      <Popover.Content align="start" sideOffset={6} collisionPadding={8} className="z-[80] w-48 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="grid grid-cols-2 gap-2" aria-label={labels.chooseTime}>
          <TimeColumn label={labels.hours} values={TIME_PICKER_HOURS} selectedValue={selected.hour} onSelect={(hour) => setTime(hour, selected.minute)} scrollRef={hourColumnRef} />
          <TimeColumn label={labels.minutes} values={TIME_PICKER_MINUTES} selectedValue={selected.minute} onSelect={(minute) => setTime(selected.hour, minute)} scrollRef={minuteColumnRef} />
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

function TimeColumn({ label, onSelect, scrollRef, selectedValue, values }: { label: string; onSelect: (value: string) => void; scrollRef: React.RefObject<HTMLDivElement | null>; selectedValue: string; values: readonly string[] }) {
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollContainer: HTMLDivElement = container;

    function handleWheel(event: WheelEvent) {
      if (!isTimePickerDiscreteWheel(event.deltaY, event.deltaMode)) return;

      event.preventDefault();
      const currentRow = Math.round(scrollContainer.scrollTop / TIME_PICKER_ROW_HEIGHT);
      const maximumRow = Math.floor((scrollContainer.scrollHeight - scrollContainer.clientHeight) / TIME_PICKER_ROW_HEIGHT);
      const direction = event.deltaY > 0 ? 1 : -1;
      const targetRow = Math.min(Math.max(currentRow + direction, 0), maximumRow);
      scrollContainer.scrollTop = targetRow * TIME_PICKER_ROW_HEIGHT;
    }

    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
    return () => scrollContainer.removeEventListener("wheel", handleWheel);
  }, [scrollRef]);

  return <section className="min-w-0">
    <h3 className="px-2 pb-1 text-xs font-medium text-[var(--ui-text-muted)]">{label}</h3>
    <div ref={scrollRef} role="listbox" aria-label={label} className="scrollbar-none max-h-60 overflow-y-auto overscroll-contain">
      {values.map((option) => {
        const isSelected = option === selectedValue;
        return <button key={option} type="button" role="option" aria-selected={isSelected} data-selected={isSelected || undefined} style={{ height: TIME_PICKER_ROW_HEIGHT }} className={cn("flex w-full items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] text-sm ui-numeric transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", isSelected ? "bg-[var(--ui-action-primary)] font-semibold text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]")} onClick={() => onSelect(option)}>{option}</button>;
      })}
    </div>
  </section>;
}
