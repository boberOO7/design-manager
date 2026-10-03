"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";

type PersonOption = { id: string; name: string; avatarUrl?: string | null };

type Props = {
  people: readonly PersonOption[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  removeLabel: (name: string) => string;
  disabled?: boolean;
  invalid?: boolean;
};

/** Controlled person selection. Eligibility, domain labels and persistence belong to the caller. */
export function PeoplePicker({ people, selectedIds, onChange, label, placeholder, searchPlaceholder, emptyMessage, removeLabel, disabled, invalid }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  const selected = people.filter((person) => selectedIds.includes(person.id));
  const visibleChips = selected.slice(0, 2);
  const overflowCount = selected.length - visibleChips.length;
  const visible = people.filter((person) => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  }

  return <Popover.Root open={open && !disabled} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
    <div ref={fieldRef} data-open={open && !disabled || undefined} data-invalid={invalid || undefined} data-disabled={disabled || undefined} className="relative flex h-11 min-w-0 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2 transition-colors duration-180 hover:border-[var(--ui-text-muted)] focus-within:border-[var(--ui-focus)] data-[open]:border-[var(--ui-focus)] data-[invalid]:border-[var(--ui-danger-border)] data-[disabled]:border-[var(--ui-border-strong)] data-[disabled]:bg-[var(--ui-surface-muted)]" data-people-picker>
      <Popover.Trigger asChild>
        <button ref={setTriggerNode} type="button" disabled={disabled} aria-label={label} aria-invalid={invalid || undefined} className="absolute inset-0 rounded-[var(--ui-radius-control)] focus-visible:outline-none disabled:cursor-not-allowed" data-people-trigger />
      </Popover.Trigger>
      <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-1.5 py-1" data-people-chips>
        {visibleChips.map((person) => <button key={person.id} type="button" disabled={disabled} onClick={() => { toggle(person.id); (open ? searchRef.current : triggerNode)?.focus({ preventScroll: true }); }} aria-label={removeLabel(person.name)} title={person.name} className="people-picker-chip pointer-events-auto inline-flex h-8 min-w-0 max-w-48 shrink items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] py-1 pl-1 pr-2 text-sm font-normal text-[var(--ui-text)] transition-colors duration-180 hover:border-[var(--ui-text-muted)] focus-visible:border-[var(--ui-focus)] focus-visible:outline-none disabled:cursor-not-allowed" data-people-chip>
              <UserAvatar decorative imageUrl={person.avatarUrl} name={person.name} size="board" />
              <span className="min-w-0 truncate">{person.name}</span><X aria-hidden="true" className="size-3 shrink-0 text-[var(--ui-text-secondary)]" />
            </button>)}
        {overflowCount > 0 ? <span className="people-picker-chip ui-numeric inline-flex h-8 shrink-0 items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-2 text-xs font-medium text-[var(--ui-text-secondary)]" title={selected.slice(2).map((person) => person.name).join(", ")} data-people-overflow>+{overflowCount}</span> : null}
        {!selected.length ? <span className="truncate px-1 text-sm font-normal text-[var(--ui-text-muted)]">{placeholder}</span> : null}
      </div>
      <ChevronDown aria-hidden="true" className={`pointer-events-none relative ml-2 size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-180 ${open ? "rotate-180" : ""}`} />
    </div>
    <Popover.Portal container={portalContainer}>
      <Popover.Content align="start" sideOffset={6} collisionPadding={8} className="people-picker-popover z-[80] flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]" onInteractOutside={(event) => { if (event.target instanceof Node && fieldRef.current?.contains(event.target)) event.preventDefault(); }}>
        <div className="flex h-11 shrink-0 items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] px-3 transition-colors duration-180 hover:border-[var(--ui-text-muted)] focus-within:border-[var(--ui-focus)]" data-people-search>
          <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" />
          <input ref={searchRef} aria-label={searchPlaceholder} placeholder={searchPlaceholder} autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-text-muted)] focus-visible:outline-none focus-visible:ring-0" style={{ border: 0, boxShadow: "none", outline: "none" }} />
        </div>
        <div className="mt-2 min-h-0 max-h-64 overflow-y-auto overscroll-contain">
          {visible.length ? visible.map((person) => <label key={person.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] border border-transparent px-2 text-left transition-colors duration-180 hover:bg-[var(--ui-surface-muted)] has-[:focus-visible]:border-[var(--ui-focus)]">
            <input type="checkbox" disabled={disabled} checked={selectedIds.includes(person.id)} onChange={() => toggle(person.id)} className="size-4 shrink-0 accent-[var(--ui-action-primary)] focus-visible:outline-none" />
            <UserAvatar decorative imageUrl={person.avatarUrl} name={person.name} size="boardCard" />
            <span className="min-w-0 flex-1 truncate text-sm font-normal">{person.name}</span>
          </label>) : <p className="p-3 text-sm font-normal text-[var(--ui-text-muted)]">{emptyMessage}</p>}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
