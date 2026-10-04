"use client";

import * as Popover from "@radix-ui/react-popover";
import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function StatisticsInfo({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTranslations("Statistics");
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" aria-label={t("aboutMetric", { metric: label })}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ui-text-muted)] transition-colors duration-[180ms] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><Info className="size-3.5" aria-hidden="true" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content sideOffset={5} collisionPadding={12} aria-label={label}
      className="z-[80] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-xs leading-6 text-[var(--ui-text-secondary)] shadow-[var(--ui-shadow-popover)]">
      <div className="mb-1 flex items-start justify-between gap-3"><p className="font-semibold text-[var(--ui-text)]">{label}</p><Popover.Close aria-label={t("closeInfo")} className="rounded p-1 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><X className="size-4" aria-hidden="true" /></Popover.Close></div>
      {children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
