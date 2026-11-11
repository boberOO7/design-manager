"use client";

import { createContext, Fragment, useContext, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";

const StatisticsPeopleContext = createContext<{
  showFormer: boolean;
  toggleFormer: () => void;
} | null>(null);

export function StatisticsPeopleProvider({ children }: { children: ReactNode }) {
  const [showFormer, setShowFormer] = useState(false);
  return <StatisticsPeopleContext.Provider value={{ showFormer, toggleFormer: () => setShowFormer(value => !value) }}>
    {children}
  </StatisticsPeopleContext.Provider>;
}

export function useStatisticsPeopleScope() {
  const context = useContext(StatisticsPeopleContext);
  if (!context) throw new Error("Statistics people scope requires its provider.");
  return context;
}

export function StatisticsPeopleToggle() {
  const t = useTranslations("Statistics");
  const { showFormer, toggleFormer } = useStatisticsPeopleScope();
  return <Tooltip content={t("formerEmployeesHint")}>
    <button type="button" role="switch" aria-checked={showFormer} aria-label={t("showFormerEmployees")} onClick={toggleFormer}
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[var(--ui-radius-control)] px-1 text-xs font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none">
      <span>{t("formerEmployees")}</span>
      <span aria-hidden="true" className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none ${showFormer ? "border-[var(--ui-action-primary)] bg-[var(--ui-action-primary)]" : "border-[var(--ui-border-strong)] bg-[var(--ui-surface-strong)]"}`}>
        <span className={`absolute left-px top-px size-3 rounded-full shadow-[var(--ui-shadow-panel)] transition-[translate,background-color] duration-200 ease-out motion-reduce:transition-none ${showFormer ? "translate-x-3 bg-[var(--ui-action-primary-text)]" : "bg-[var(--ui-text-muted)]"}`} />
      </span>
    </button>
  </Tooltip>;
}

/** Keep formatted table content on the server; only row visibility is interactive. */
export function StatisticsPeopleRows({ rows, empty }: {
  rows: Array<{ id: string; active: boolean; content: ReactNode }>;
  empty: ReactNode;
}) {
  const { showFormer } = useStatisticsPeopleScope();
  const visible = rows.filter(row => showFormer || row.active);
  return visible.length ? visible.map(row => <Fragment key={row.id}>{row.content}</Fragment>) : empty;
}
