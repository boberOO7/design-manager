"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

export function SortableListHeader({ active, className = "", direction, label, nextDirection, onClick }: { active: boolean; className?: string; direction: "asc" | "desc"; label: string; nextDirection: "asc" | "desc"; onClick: () => void }) {
  const t = useTranslations("Common");
  const Indicator = active ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <button type="button" aria-pressed={active} aria-description={active ? t(direction === "asc" ? "sortedAscending" : "sortedDescending") : undefined} title={t(nextDirection === "asc" ? "sortAscending" : "sortDescending")} onClick={onClick} className={`group flex min-h-8 w-fit items-center gap-1.5 rounded-sm py-1 transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${active ? "text-[var(--ui-text)]" : ""} ${className}`}>
    {label}<Indicator aria-hidden="true" className={`size-3 transition-opacity duration-200 ${active ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`} />
  </button>;
}
