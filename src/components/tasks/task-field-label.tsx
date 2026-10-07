"use client";

import * as Popover from "@radix-ui/react-popover";
import { CircleHelp, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function TaskFieldLabel({ label, icon: Icon, help, htmlFor }: { label: string; icon?: LucideIcon; help?: string; htmlFor?: string }) {
  const t = useTranslations("Tasks");
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const content = <span className="inline-flex items-center gap-1.5">{Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-muted)]" /> : null}{label}</span>;
  return <span className="flex min-w-0 items-center gap-1">
    {htmlFor ? <label htmlFor={htmlFor}>{content}</label> : content}
    {help ? <Popover.Root><Popover.Trigger asChild><button ref={setTrigger} type="button" aria-label={t("fieldHelp", { field: label })} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><CircleHelp aria-hidden="true" className="size-3.5" /></button></Popover.Trigger><Popover.Portal container={trigger?.closest("dialog, [role='dialog']") ?? undefined}><Popover.Content sideOffset={6} collisionPadding={12} className="z-[80] max-w-[min(20rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-xs font-normal leading-5 text-[var(--ui-text-secondary)] shadow-[var(--ui-shadow-popover)]">{help}</Popover.Content></Popover.Portal></Popover.Root> : null}
  </span>;
}
