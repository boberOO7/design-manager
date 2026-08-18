"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractorCategory } from "@/data/queries/contractors";
import { getContractorCategoryBadgeClassName } from "@/lib/contractor-category-colors";
import { cn } from "@/lib/utils";

export function getUniqueContractorCategories(categories: readonly ContractorCategory[]): ContractorCategory[] {
  const seen = new Set<string>();
  return categories.flatMap((category) => {
    const trimmed = category.name.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [{ ...category, name: trimmed }];
  }).sort((first, second) => first.name.localeCompare(second.name, "uk"));
}

export function ContractorCategoryCombobox({ categories, describedBy, invalid, value, onValueChange }: {
  categories: readonly ContractorCategory[];
  describedBy?: string;
  invalid?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations("Contractors");
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = getUniqueContractorCategories(categories);
  const query = value.trim();
  const queryKey = query.toLocaleLowerCase();
  const visibleOptions = options.filter((category) => category.name.toLocaleLowerCase().includes(queryKey));
  const hasExactMatch = options.some((category) => category.name.toLocaleLowerCase() === queryKey);
  const canCreate = Boolean(query && !hasExactMatch);
  const optionCount = visibleOptions.length + (canCreate ? 1 : 0);
  const portalContainer = inputNode?.closest("dialog, [role='dialog']") ?? undefined;

  function openSuggestions() {
    setOpen(true);
    setActiveIndex(visibleOptions.length ? 0 : canCreate ? 0 : -1);
  }

  function choose(category: ContractorCategory | string) {
    onValueChange(typeof category === "string" ? category : category.name);
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
          placeholder={t("form.categoryPlaceholder")}
          required
          role="combobox"
          value={value}
        />
        <button type="button" aria-label={t("form.showCategories")} className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-r-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { if (open) { setOpen(false); setActiveIndex(-1); } else openSuggestions(); }}>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
    </PopoverPrimitive.Anchor>
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content align="start" sideOffset={4} collisionPadding={8} className="z-[80] box-border w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
        <div id={listboxId} role="listbox" className="max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-auto p-1">
          {visibleOptions.map((category, index) => <button key={category.id} id={optionId(index)} type="button" role="option" aria-selected={value.trim().toLocaleLowerCase() === category.name.toLocaleLowerCase()} className={cn("grid min-h-12 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 py-2.5 text-left text-sm text-[var(--ui-text-secondary)] outline-none", activeIndex === index && "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]", value.trim().toLocaleLowerCase() === category.name.toLocaleLowerCase() && "font-medium text-[var(--ui-text)]")} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(category)}><span className="flex size-4 items-center justify-center">{value.trim().toLocaleLowerCase() === category.name.toLocaleLowerCase() ? <Check aria-hidden="true" className="size-3.5" /> : null}</span><span className={`w-fit max-w-full rounded-full px-2 py-0.5 text-xs font-medium leading-5 ${getContractorCategoryBadgeClassName(category.colorKey)}`}><span className="block truncate">{category.name}</span></span></button>)}
          {canCreate ? <button id={optionId(visibleOptions.length)} type="button" role="option" aria-selected={false} className={cn("grid min-h-12 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 py-2.5 text-left text-sm font-medium text-[var(--ui-info-text)] outline-none", activeIndex === visibleOptions.length && "bg-[var(--ui-surface-muted)]")} onMouseEnter={() => setActiveIndex(visibleOptions.length)} onClick={() => choose(query)}><Plus aria-hidden="true" className="size-4" /><span className="min-w-0 truncate">{t("form.createCategory", { category: query })}</span></button> : null}
          {!visibleOptions.length && !canCreate ? <p className="px-3 py-4 text-sm text-[var(--ui-text-muted)]">{t("form.categoryEmpty")}</p> : null}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
