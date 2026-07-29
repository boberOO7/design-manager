import { cn } from "@/lib/utils";

export type SegmentedControlItem<T extends string> = { label: string; value: T };

export function getSegmentedControlItemProps(selected: boolean) {
  return { "aria-pressed": selected };
}

export function SegmentedControl<T extends string>({ ariaLabel, className, items, onValueChange, value }: { ariaLabel: string; className?: string; items: readonly SegmentedControlItem<T>[]; onValueChange: (value: T) => void; value: T }) {
  return <div aria-label={ariaLabel} className={cn("inline-flex rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1", className)} role="group">
    {items.map((item) => {
      const selected = item.value === value;
      return <button key={item.value} type="button" onClick={() => onValueChange(item.value)} {...getSegmentedControlItemProps(selected)} className={cn("min-h-9 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", selected ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-panel)]" : "text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]")}>
        {item.label}
      </button>;
    })}
  </div>;
}
