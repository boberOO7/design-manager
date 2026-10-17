"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

const focus = "rounded-[var(--ui-radius-control)] transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none";

export function OverviewDetail({ title, children, info = false }: { title: string; children: ReactNode; info?: boolean }) {
  const t = useTranslations("Finance");
  return <Popover.Root><Popover.Trigger asChild><button type="button" aria-label={info ? title : undefined} className={`${focus} inline-flex items-center justify-center gap-1.5 text-xs text-[var(--ui-text-secondary)] ${info ? "size-9 shrink-0 hover:bg-[var(--ui-surface-muted)]" : "min-h-7"}`}>{info ? <Info className="size-3.5" aria-hidden="true"/> : <>{title}<ChevronDown className="size-3" aria-hidden="true"/></>}</button></Popover.Trigger>
    <Popover.Portal><Popover.Content sideOffset={8} collisionPadding={12} aria-label={title} className="z-[80] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-24px)] overflow-y-auto rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-popover)]">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{title}</p><Popover.Close aria-label={t("close")} className={`${focus} p-1`}><X className="size-4" aria-hidden="true"/></Popover.Close></div>{children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

