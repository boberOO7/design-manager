"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function getUniqueContractorCategories(categories: readonly string[]): string[] {
  const seen = new Set<string>();
  return categories.flatMap((category) => {
    const trimmed = category.trim();
    const key = trimmed.toLocaleLowerCase("uk");
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  }).sort((first, second) => first.localeCompare(second, "uk"));
}

export function ContractorCategoryCombobox({ categories, describedBy, invalid, value, onValueChange }: {
  categories: readonly string[];
  describedBy?: string;
  invalid?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = getUniqueContractorCategories(categories);
  const query = value.trim();
  const queryKey = query.toLocaleLowerCase("uk");
  const visibleOptions = options.filter((category) => category.toLocaleLowerCase("uk").includes(queryKey));
  const hasExactMatch = options.some((category) => category.toLocaleLowerCase("uk") === queryKey);
  const canCreate = Boolean(query && !hasExactMatch);
  const optionCount = visibleOptions.length + (canCreate ? 1 : 0);
  const portalContainer = inputNode?.closest("dialog, [role='dialog']") ?? undefined;

  function openSuggestions() {
    setOpen(true);
    setActiveIndex(visibleOptions.length ? 0 : canCreate ? 0 : -1);
  }

  function choose(category: string) {
    onValueChange(category);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus({ preventScroll: true });
  }

  function selectActive() {
    if (activeIndex < 0) return;
    if (activeIndex < visibleOptions.length) choose(visibleOptions[activeIndex]);
    else if (canCreate) choose(query);
  }

  function optionId(index: number) {
    return `${listboxId}-option-${index}`;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openSuggestions();
        return;
      }
      if (optionCount) setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + optionCount) % optionCount);
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      selectActive();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return <PopoverPrimitive.Root modal={false} open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Anchor asChild>
      <div className="relative">
        <input
          ref={(node) => { inputRef.current = node; setInputNode(node); }}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className="h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 pr-11 text-sm text-[var(--ui-text)] transition-colors placeholder:text-[var(--ui-text-muted)] focus-visible:border-[var(--ui-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 aria-invalid:border-[var(--ui-danger-border)] aria-invalid:focus-visible:ring-[var(--ui-danger-text)]"
          data-dialog-initial-focus
          name="category"
          onClick={openSuggestions}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Оберіть або введіть категорію"
          required
          role="combobox"
          value={value}
        />
        <button type="button" aria-label="Показати категорії" className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-r-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { if (open) { setOpen(false); setActiveIndex(-1); } else openSuggestions(); }}>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
    </PopoverPrimitive.Anchor>
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content align="start" sideOffset={4} collisionPadding={8} className="z-[80] box-border w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
        <div id={listboxId} role="listbox" className="max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-auto p-1">
          {visibleOptions.map((category, index) => <button key={category} id={optionId(index)} type="button" role="option" aria-selected={value.trim().toLocaleLowerCase("uk") === category.toLocaleLowerCase("uk")} className={cn("grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 py-2 text-left text-sm text-[var(--ui-text-secondary)] outline-none", activeIndex === index && "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]", value.trim().toLocaleLowerCase("uk") === category.toLocaleLowerCase("uk") && "font-medium text-[var(--ui-text)]")} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(category)}><span className="flex size-4 items-center justify-center">{value.trim().toLocaleLowerCase("uk") === category.toLocaleLowerCase("uk") ? <Check aria-hidden="true" className="size-3.5" /> : null}</span><span className="min-w-0 truncate">{category}</span></button>)}
          {canCreate ? <button id={optionId(visibleOptions.length)} type="button" role="option" aria-selected={false} className={cn("grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 py-2 text-left text-sm font-medium text-[var(--ui-info-text)] outline-none", activeIndex === visibleOptions.length && "bg-[var(--ui-surface-muted)]")} onMouseEnter={() => setActiveIndex(visibleOptions.length)} onClick={() => choose(query)}><Plus aria-hidden="true" className="size-4" /><span className="min-w-0 truncate">Створити категорію «{query}»</span></button> : null}
          {!visibleOptions.length && !canCreate ? <p className="px-3 py-4 text-sm text-[var(--ui-text-muted)]">Почніть вводити назву категорії.</p> : null}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
