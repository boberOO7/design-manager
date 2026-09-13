"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { inputClassName } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export function filterCreatableSuggestions(options: readonly string[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)))
    .filter((option) => option.toLocaleLowerCase().includes(normalized))
    .slice(0, 12);
}

export function CreatableCombobox({ createLabel, emptyLabel, maxLength = 160, name, options, loadOptions, showLabel, value, onBlur, onValueChange }: {
  createLabel: (value: string) => string;
  emptyLabel: string;
  maxLength?: number;
  name?: string;
  options: readonly string[];
  loadOptions?: (query: string, signal: AbortSignal) => Promise<string[]>;
  showLabel: string;
  value: string;
  onBlur?: (value: string) => void;
  onValueChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = value.trim();
  const [remote, setRemote] = useState<{ query: string; loader: typeof loadOptions; values: string[] } | null>(null);
  useEffect(() => {
    if (!open || !loadOptions) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadOptions(query, controller.signal).then((values) => {
        if (!controller.signal.aborted) setRemote({ query, loader: loadOptions, values });
      }).catch(() => {
        if (!controller.signal.aborted) setRemote({ query, loader: loadOptions, values: [] });
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, loadOptions]);
  const suggestions = loadOptions
    ? remote?.query === query && remote.loader === loadOptions ? remote.values : filterCreatableSuggestions(options, query)
    : filterCreatableSuggestions(options, query);
  const canCreate = Boolean(query && !suggestions.some((option) => option.toLocaleLowerCase() === query.toLocaleLowerCase()));
  const optionCount = suggestions.length + (canCreate ? 1 : 0);
  const selectedIndex = Math.min(activeIndex, optionCount - 1);
  const portalContainer = inputNode?.closest("dialog, [role='dialog']") ?? undefined;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  function openSuggestions() {
    setOpen(true);
    setActiveIndex(optionCount ? 0 : -1);
  }

  function choose(nextValue: string) {
    onValueChange(nextValue);
    onBlur?.(nextValue);
    setOpen(false);
    setActiveIndex(-1);
    inputNode?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openSuggestions();
      if (optionCount) setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + optionCount) % optionCount);
    } else if (event.key === "Enter" && open && selectedIndex >= 0) {
      event.preventDefault();
      choose(selectedIndex < suggestions.length ? suggestions[selectedIndex] : query);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return <PopoverPrimitive.Root modal={false} open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Anchor asChild><div className="relative">
      <input ref={setInputNode} aria-activedescendant={open && selectedIndex >= 0 ? optionId(selectedIndex) : undefined} aria-autocomplete="list" aria-controls={listboxId} aria-expanded={open} autoComplete="off" className={cn(inputClassName, "pr-11")} maxLength={maxLength} name={name} onBlur={(event) => onBlur?.(event.currentTarget.value)} onChange={(event) => { onValueChange(event.target.value); setOpen(true); setActiveIndex(0); }} onClick={openSuggestions} onFocus={openSuggestions} onKeyDown={handleKeyDown} role="combobox" value={value} />
      <button type="button" aria-label={showLabel} className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-r-[var(--ui-radius-control)] text-[var(--ui-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onMouseDown={(event) => event.preventDefault()} onClick={() => open ? setOpen(false) : openSuggestions()}><ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} /></button>
    </div></PopoverPrimitive.Anchor>
    <PopoverPrimitive.Portal container={portalContainer}><PopoverPrimitive.Content align="start" sideOffset={4} collisionPadding={8} className="z-[80] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
      <div id={listboxId} role="listbox" className="max-h-[min(18rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1">
        {suggestions.map((option, index) => <button key={option} id={optionId(index)} type="button" role="option" aria-selected={query.toLocaleLowerCase() === option.toLocaleLowerCase()} className={cn("grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-left text-sm text-[var(--ui-text-secondary)] outline-none", selectedIndex === index && "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]")} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><span>{query.toLocaleLowerCase() === option.toLocaleLowerCase() ? <Check className="size-3.5" aria-hidden="true" /> : null}</span><span className="truncate">{option}</span></button>)}
        {canCreate ? <button id={optionId(suggestions.length)} type="button" role="option" aria-selected={false} className={cn("grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-left text-sm font-medium text-[var(--ui-info-text)] outline-none", selectedIndex === suggestions.length && "bg-[var(--ui-surface-muted)]")} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(suggestions.length)} onClick={() => choose(query)}><Plus className="size-4" aria-hidden="true" /><span className="truncate">{createLabel(query)}</span></button> : null}
        {!suggestions.length && !canCreate ? <p className="px-3 py-4 text-sm text-[var(--ui-text-muted)]">{emptyLabel}</p> : null}
      </div>
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
