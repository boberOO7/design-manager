"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ListChecks, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import { cn } from "@/lib/utils";

const optionClassName = "flex min-h-9 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50";

export function ChecklistTemplatePicker({ checklistTemplates, currentId, label, onSelect, taskControl = false, bulkAction = false, disabled = false, emptyLabel, triggerClassName, ariaLabel, matchTriggerWidth = false }: {
  checklistTemplates: StudioChecklistTemplate[];
  currentId?: string | null;
  label: string;
  onSelect: (id: string) => void;
  taskControl?: boolean;
  bulkAction?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  matchTriggerWidth?: boolean;
}) {
  const t = useTranslations("Templates");
  const [open, setOpen] = useState(false);
  const [instantMotion, setInstantMotion] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const available = checklistTemplates.filter(template => !template.archivedAt || template.id === currentId).filter(template => template.name.toLocaleLowerCase().includes(normalizedQuery));
  const showEmpty = emptyLabel !== undefined && emptyLabel.toLocaleLowerCase().includes(normalizedQuery);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Handle the menu before a containing dialog's document capture listener.
      event.preventDefault();
      event.stopPropagation();
      setInstantMotion(true);
      setOpen(false);
      setQuery("");
    }
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  function choose(id: string, instant = false) {
    if (disabled) return;
    setInstantMotion(instant);
    onSelect(id);
    setOpen(false);
    setQuery("");
  }

  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
    <Popover.Trigger asChild>
      <button ref={setTriggerNode} type="button" disabled={disabled} onClick={event => setInstantMotion(event.detail === 0)} aria-label={ariaLabel ?? (taskControl ? label : undefined)} className={cn("flex min-h-8 max-w-full min-w-0 items-center gap-1 rounded px-1 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", taskControl && currentId && "bg-[var(--ui-surface-muted)]", bulkAction && "min-h-8 bg-[var(--ui-action-primary)] px-3 text-sm font-semibold text-[var(--ui-action-primary-text)] hover:bg-[var(--ui-action-primary-hover)]", triggerClassName)}>
        {taskControl ? currentId ? <ListChecks className="size-3.5 shrink-0" aria-hidden="true" /> : <Plus className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className={cn("truncate", taskControl && "hidden 2xl:inline")}>{label}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
    </Popover.Trigger>
    <Popover.Portal container={triggerNode?.closest("dialog, [role='dialog']") ?? undefined}>
      <Popover.Content data-instant={instantMotion || undefined} align={bulkAction ? "end" : "start"} side={bulkAction ? "top" : "bottom"} sideOffset={8} collisionPadding={8} avoidCollisions onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }} className={cn("checklist-template-picker-popover z-[80] w-[min(18rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 shadow-[var(--ui-shadow-popover)]", matchTriggerWidth && "w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]")}>
        <input ref={searchRef} type="search" disabled={disabled} aria-label={t("searchChecklistTemplate")} placeholder={t("searchChecklistPlaceholder")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const firstId = showEmpty ? "" : available.find(template => !template.archivedAt)?.id;
          if (firstId !== undefined) choose(firstId, true);
        }} className="ui-form-control w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5 text-sm text-[var(--ui-text)]" />
        <div className="mt-1 max-h-52 overflow-y-auto">
          {showEmpty ? <button type="button" disabled={disabled} onClick={event => choose("", event.detail === 0)} className={optionClassName}><span className="truncate">{emptyLabel}</span>{!currentId ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}</button> : null}
          {available.map(template => <button key={template.id} type="button" disabled={disabled || Boolean(template.archivedAt)} onClick={event => choose(template.id, event.detail === 0)} className={optionClassName}><span className="truncate">{template.name}</span>{template.id === currentId ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}</button>)}
          {!showEmpty && !available.length ? <p className="px-2 py-3 text-sm text-[var(--ui-text-muted)]">{t("checklistTemplatesNotFound")}</p> : null}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
