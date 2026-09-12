"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function stepNumericText(value: string, delta: -1 | 1, min = 1, max = 1_000_000, preserveWidth = false) {
  const parsed = Number(value);
  const next = Math.max(min, Math.min(max, Number.isSafeInteger(parsed) ? parsed + delta : min));
  return preserveWidth ? String(next).padStart(value.length, "0") : String(next);
}

export function NumericStepper({ ariaLabel, decreaseLabel, increaseLabel, invalid, max = 1_000_000, min = 1, name, prefix, preserveWidth = false, value, onValueChange, initialFocus = false }: {
  ariaLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  initialFocus?: boolean;
  invalid?: boolean;
  max?: number;
  min?: number;
  name?: string;
  prefix?: string;
  preserveWidth?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const numericValue = Number(value);
  const validNumber = Number.isSafeInteger(numericValue);
  return <div className="inline-flex overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)]" data-numeric-stepper>
    <Button type="button" variant="ghost" className="size-11 rounded-none p-0" aria-label={decreaseLabel} disabled={validNumber && numericValue <= min} onClick={() => onValueChange(stepNumericText(value, -1, min, max, preserveWidth))}><Minus className="size-4" aria-hidden="true" /></Button>
    <label className="flex h-11 min-w-20 items-center justify-center border-x border-[var(--ui-border-strong)] px-2 font-mono text-sm font-semibold tabular-nums text-[var(--ui-text)] focus-within:relative focus-within:z-10 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--ui-focus)]"><span aria-hidden="true">{prefix}</span><span className="sr-only">{ariaLabel}</span><input data-dialog-initial-focus={initialFocus || undefined} aria-invalid={invalid || undefined} aria-label={ariaLabel} className="min-w-4 max-w-16 appearance-none bg-transparent text-center outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="numeric" maxLength={String(max).length} name={name} pattern="[0-9]+" required value={value} onChange={(event) => { if (/^\d*$/.test(event.target.value)) onValueChange(event.target.value); }} /></label>
    <Button type="button" variant="ghost" className="size-11 rounded-none p-0" aria-label={increaseLabel} disabled={validNumber && numericValue >= max} onClick={() => onValueChange(stepNumericText(value, 1, min, max, preserveWidth))}><Plus className="size-4" aria-hidden="true" /></Button>
  </div>;
}
