import { cn } from "@/lib/utils";

export type SegmentedControlItem<T extends string> = { label: string; value: T };

export function getSegmentedControlItemProps(selected: boolean) {
  return { "aria-pressed": selected };
}

export function SegmentedControl<T extends string>({ ariaLabel, className, disabled = false, items, onValueChange, value }: { ariaLabel: string; className?: string; disabled?: boolean; items: readonly SegmentedControlItem<T>[]; onValueChange: (value: T) => void; value: T | null }) {
  const selectedIndex = items.findIndex((item) => item.value === value);
  return <div aria-label={ariaLabel} className={cn("relative inline-grid rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1", className)} role="group" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    <span data-segmented-indicator aria-hidden="true" className={cn("pointer-events-none absolute bottom-1 left-1 top-1 rounded-[calc(var(--ui-radius-control)-2px)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none", selectedIndex < 0 && "opacity-0")} style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${Math.max(0, selectedIndex) * 100}%)` }} />
    {items.map((item) => {
      const selected = item.value === value;
      return <button key={item.value} type="button" disabled={disabled} onClick={() => onValueChange(item.value)} {...getSegmentedControlItemProps(selected)} className={cn("relative z-10 min-h-9 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60", selected ? "text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]")}>
        {item.label}
      </button>;
    })}
  </div>;
}
