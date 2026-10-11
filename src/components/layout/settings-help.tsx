"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export const settingsHelpPanelClassName = "people-picker-popover z-[80] max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-sm leading-5 text-[var(--ui-text-secondary)] shadow-[var(--ui-shadow-popover)] motion-reduce:!animate-none";

export function SettingsHelp({ label, children, trigger }: { label: string; children: ReactNode; trigger?: ReactNode }) {
  const t = useTranslations("Account");
  return <Popover.Root modal>
    <Popover.Trigger asChild>{trigger ?? <Button type="button" variant="ghost" aria-label={t("settingsHelp", { setting: label })} className="size-8 shrink-0 p-0 text-[var(--ui-text-muted)]"><Info className="size-3.5" aria-hidden="true" /></Button>}</Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="end" sideOffset={6} collisionPadding={12} aria-modal="true" aria-label={label} className={settingsHelpPanelClassName}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ui-text)]">{label}</p>
        <Popover.Close asChild><Button type="button" variant="ghost" aria-label={t("close")} className="size-8 shrink-0 p-0"><X className="size-4" aria-hidden="true" /></Button></Popover.Close>
      </div>
      {children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
