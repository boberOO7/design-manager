"use client";

import { cn } from "@/lib/utils";

export function BinarySwitch<T extends string>({ disabled = false, emptyLabel, hideLabel = false, label, value, options, onChange, optionLabel }: { disabled?: boolean; emptyLabel: string; hideLabel?: boolean; label: string; value: T | null; options: readonly [T, T]; onChange: (value: T) => void; optionLabel?: (value: T) => string }) {
  const selectedIndex = value === options[0] ? 0 : value === options[1] ? 1 : -1;
  const labels = options.map((option) => optionLabel?.(option) ?? option);
  return <fieldset className="min-w-0">{!hideLabel && <legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{label}</legend>}<button type="button" role="switch" aria-checked={selectedIndex === 1} aria-label={`${label}: ${selectedIndex < 0 ? emptyLabel : labels[selectedIndex]}`} disabled={disabled} data-binary-switch-state={selectedIndex < 0 ? "unset" : selectedIndex === 0 ? "left" : "right"} onClick={() => onChange(selectedIndex === 0 ? options[1] : options[0])} className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full px-1 text-sm font-medium transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60">
    <span data-binary-switch-label="left" aria-hidden="true" className={cn("min-w-0 text-right transition-colors duration-200", selectedIndex === 0 ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]")}>{labels[0]}</span>
    <span aria-hidden="true" className="relative h-6 w-[3.25rem] shrink-0 rounded-full bg-[var(--ui-surface-strong)] shadow-inner"><span data-binary-switch-thumb className={cn("absolute left-1 top-1 size-4 rounded-full bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)] transition-[transform,opacity] duration-[220ms] ease-out", selectedIndex < 0 && "opacity-50")} style={{ transform: `translateX(${selectedIndex === 1 ? "1.75rem" : selectedIndex < 0 ? "0.875rem" : "0"})` }} /></span>
    <span data-binary-switch-label="right" aria-hidden="true" className={cn("min-w-0 text-left transition-colors duration-200", selectedIndex === 1 ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]")}>{labels[1]}</span>
  </button></fieldset>;
}
