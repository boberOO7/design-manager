"use client";

import * as Popover from "@radix-ui/react-popover";
import { Clock3 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const TIME_PICKER_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
export const TIME_PICKER_MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const TIME_VALUE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string) {
  const match = TIME_VALUE.exec(value);
  return { hour: match?.[1] ?? "00", minute: match?.[2] ?? "00" };
}

function scrollToSelected(container: HTMLDivElement | null) {
  container?.querySelector<HTMLElement>("[data-selected='true']")?.scrollIntoView({ block: "center" });
}

function handleColumnWheel(event: React.WheelEvent<HTMLDivElement>) {
  // Mouse wheels report line deltas; constrain those to one snapped row while
  // leaving high-resolution trackpad scrolling entirely native.
  if (event.deltaMode !== WheelEvent.DOM_DELTA_LINE || event.deltaY === 0) return;
  event.preventDefault();
  event.currentTarget.scrollBy({ top: Math.sign(event.deltaY) * 40, behavior: "smooth" });
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
          <TimeColumn label={labels.hours} values={TIME_PICKER_HOURS} selectedValue={selected.hour} onSelect={(hour) => setTime(hour, selected.minute)} scrollRef={hourColumnRef} onWheel={handleColumnWheel} />
          <TimeColumn label={labels.minutes} values={TIME_PICKER_MINUTES} selectedValue={selected.minute} onSelect={(minute) => setTime(selected.hour, minute)} scrollRef={minuteColumnRef} onWheel={handleColumnWheel} />
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

function TimeColumn({ label, onSelect, onWheel, scrollRef, selectedValue, values }: { label: string; onSelect: (value: string) => void; onWheel: (event: React.WheelEvent<HTMLDivElement>) => void; scrollRef: React.RefObject<HTMLDivElement | null>; selectedValue: string; values: readonly string[] }) {
  return <section className="min-w-0">
    <h3 className="px-2 pb-1 text-xs font-medium text-[var(--ui-text-muted)]">{label}</h3>
    <div ref={scrollRef} role="listbox" aria-label={label} onWheel={onWheel} className="scrollbar-none max-h-60 snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth">
      {values.map((option) => {
        const isSelected = option === selectedValue;
        return <button key={option} type="button" role="option" aria-selected={isSelected} data-selected={isSelected || undefined} className={cn("flex h-10 w-full snap-start items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] text-sm ui-numeric transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", isSelected ? "bg-[var(--ui-action-primary)] font-semibold text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]")} onClick={() => onSelect(option)}>{option}</button>;
      })}
    </div>
  </section>;
}
