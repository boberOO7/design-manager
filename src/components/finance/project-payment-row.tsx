"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";

export function ProjectPaymentRow({ id, title, date, amount, status, statusClass, progress, equivalent, open, hasDetails, expense, children, onRecord, onEdit, onMatch, onCancel, onHistory, onCloseRemainder, tripHref }: {
  id: string; title: string; date: string; amount: string; status: string; statusClass: string;
  progress?: string; equivalent?: string; open: boolean; hasDetails: boolean; expense: boolean; children: ReactNode;
  onRecord?: () => void; onEdit?: () => void; onMatch?: () => void; onCancel?: () => void; onHistory?: () => void; onCloseRemainder?: () => void; tripHref?: string;
}) {
  const t = useTranslations("Finance"), disclosureId = useId();
  const [expanded, setExpanded] = useState(open);
  const actionsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setExpanded(open); }, [open]);
  const actionClass = "flex min-h-11 w-full items-center rounded-[var(--ui-radius-control)] px-3 text-left text-sm text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
  return <article id={`expected-${id}`} data-project-payment data-selected={open || undefined} tabIndex={-1} className={`min-w-0 rounded-[var(--ui-radius-control)] border bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${open ? "border-[var(--ui-border-strong)] ring-1 ring-[var(--ui-border-strong)]" : "border-[var(--ui-border-subtle)]"}`}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 lg:grid-cols-[minmax(0,1fr)_12rem_9rem_10rem_5.5rem] lg:gap-x-4 lg:px-4">
      <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date}</p></div>
      <div className="col-start-1 row-start-2 min-w-0 lg:col-start-2 lg:row-start-1">
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] leading-5 ${statusClass}`}>{status}</span>
        {progress ? <p className="ui-numeric mt-1 max-w-64 text-xs text-[var(--ui-text-secondary)]">{progress}</p> : null}
      </div>
      <div className="col-start-2 row-start-1 self-start text-right lg:col-start-3 lg:self-center"><strong className="ui-numeric whitespace-nowrap text-base font-semibold">{amount}</strong>{equivalent ? <p className="mt-1 max-w-56 text-xs text-[var(--ui-text-muted)]">{equivalent}</p> : null}</div>
      <div className="col-start-1 row-start-3 flex min-h-11 items-center justify-between gap-2 lg:col-span-1 lg:col-start-4 lg:row-start-1">
        {onRecord ? <Button size="sm" variant="outline" className="min-h-11" onClick={onRecord}>{t(expense ? "project.recordExpense" : "planning.recordPayment")}</Button> : onHistory ? <Button size="sm" variant="ghost" className="min-h-11" onClick={onHistory}>{t("projectWorkspace.history")}</Button> : <span/>}
      </div>
      <div className="col-start-2 row-start-3 flex items-center justify-end lg:col-start-5 lg:row-start-1">{rowActions()}{hasDetails ? detailToggle() : <span className="hidden w-11 lg:block"/>}</div>
    </div>
    {hasDetails ? <AnimatedFormContent id={disclosureId} labelledBy={`${disclosureId}-trigger`} isOpen={expanded}>
      <div className="space-y-2 border-t border-[var(--ui-border-subtle)] px-3 py-3 text-xs text-[var(--ui-text-secondary)] lg:px-4">{children}</div>
    </AnimatedFormContent> : null}
  </article>;

  function detailToggle() {
    return <Button type="button" id={`${disclosureId}-trigger`} size="sm" variant="ghost" className="size-11 p-0" aria-label={t("planning.detailsNamed", { name: title })} aria-expanded={expanded} aria-controls={disclosureId} onClick={() => setExpanded(!expanded)}><ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}/></Button>;
  }
  function rowActions() {
    return <Popover.Root><Popover.Trigger asChild><Button ref={actionsRef} size="sm" variant="ghost" className="size-11 p-0" aria-label={t("projectWorkspace.actionsFor", { name: title })}><MoreHorizontal aria-hidden="true" className="size-4"/></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={4} collisionPadding={8} aria-label={t("projectWorkspace.actionsFor", { name: title })} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
      {([[onEdit, "edit"], [onMatch, "planning.match"], [onHistory, "projectWorkspace.history"], [onCloseRemainder, "settlement.closeRemainder"]] as const).map(([action, label]) => action ? <Popover.Close asChild key={label}><button type="button" className={actionClass} onClick={() => { actionsRef.current?.focus(); action(); }}>{t(label)}</button></Popover.Close> : null)}
      {tripHref ? <Link href={tripHref} className={actionClass}>{t("trips.title")}</Link> : null}
      {onCancel ? <Popover.Close asChild><button type="button" className={`${actionClass} border-t border-[var(--ui-border-subtle)] !text-[var(--ui-danger-text)]`} onClick={() => { actionsRef.current?.focus(); onCancel(); }}>{t("project.cancelExpectation")}</button></Popover.Close> : null}
    </Popover.Content></Popover.Portal></Popover.Root>;
  }
}
