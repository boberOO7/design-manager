"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Check, CheckCheck, ChevronDown, History, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";

export function ProjectPaymentRow({ id, title, date, amount, status, statusClass, completed, progress, nativeAmount, open, hasDetails, expense, children, onRecord, onEdit, onMatch, onCancel, onHistory, onCloseRemainder, tripHref }: {
  id: string; title: string; date: string; amount: string; status: string; statusClass: string;
  completed?: "paid" | "closed"; progress?: string; nativeAmount?: string; open: boolean; hasDetails: boolean; expense: boolean; children: ReactNode;
  onRecord?: () => void; onEdit?: () => void; onMatch?: () => void; onCancel?: () => void; onHistory?: () => void; onCloseRemainder?: () => void; tripHref?: string;
}) {
  const t = useTranslations("Finance"), disclosureId = useId();
  const [expanded, setExpanded] = useState(open);
  const actionsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setExpanded(open); }, [open]);
  const actionClass = "flex min-h-11 w-full items-center rounded-[var(--ui-radius-control)] px-3 text-left text-sm text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
  return <article id={`expected-${id}`} data-project-payment data-selected={open || undefined} tabIndex={-1} className={`@container min-w-0 rounded-[var(--ui-radius-control)] border bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${open ? "border-[var(--ui-border-strong)] ring-1 ring-[var(--ui-border-strong)]" : "border-[var(--ui-border-subtle)]"}`}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 @min-[64rem]:grid-cols-[minmax(9rem,1fr)_10.5rem_minmax(0,1fr)_9.25rem_11rem_9.25rem] @min-[64rem]:px-4">
      <div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[var(--ui-text)]">{title}</h3><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date}</p></div>
      <div className="col-span-2 col-start-1 row-start-2 grid min-w-0 grid-cols-[10.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 @min-[64rem]:contents">
        <span className={`inline-flex items-center gap-1 justify-self-start rounded-md px-2 py-0.5 text-xs font-medium leading-5 @min-[64rem]:col-start-2 @min-[64rem]:row-start-1 ${statusClass}`}>{completed === "paid" ? <Check aria-hidden="true" className="size-3"/> : completed === "closed" ? <CheckCheck aria-hidden="true" className="size-3"/> : null}{status}</span>
        <div className="min-w-0 @min-[64rem]:col-start-3 @min-[64rem]:row-start-1">{progress ? <p className="ui-numeric break-words text-xs leading-5 text-[var(--ui-text-secondary)]">{progress}</p> : null}</div>
      </div>
      <div className="col-start-2 row-start-1 min-w-0 self-start text-right @min-[64rem]:col-start-5 @min-[64rem]:self-center"><strong className="ui-numeric whitespace-nowrap text-base font-semibold">{amount}</strong>{nativeAmount ? <p className="mt-1 max-w-56 text-xs text-[var(--ui-text-muted)]">{nativeAmount}</p> : null}</div>
      <div className="col-span-2 col-start-1 row-start-3 grid min-h-11 grid-cols-[minmax(0,1fr)_9.25rem] items-center gap-2 @min-[64rem]:contents">
        {onRecord ? <Button size="sm" variant="ghost" className="col-start-1 row-start-1 min-h-11 justify-self-start gap-1.5 whitespace-normal px-2 text-xs font-semibold text-[var(--ui-text)] @min-[64rem]:col-start-4 @min-[64rem]:justify-self-end" onClick={onRecord}><Plus aria-hidden="true" className="size-3.5 shrink-0"/>{t(expense ? "project.recordExpense" : "planning.recordPayment")}</Button> : null}
        <div className="col-start-2 row-start-1 grid grid-cols-[repeat(3,2.75rem)] items-center gap-2 @min-[64rem]:col-start-6">
          {hasDetails ? detailToggle() : null}
          {onHistory ? <Button size="sm" variant="ghost" className="col-start-2 row-start-1 size-11 p-0" aria-label={t("projectWorkspace.historyNamed", { name: title })} title={t("projectWorkspace.history")} onClick={onHistory}><History aria-hidden="true" className="size-4"/></Button> : null}
          {rowActions()}
        </div>
      </div>
    </div>
    {hasDetails ? <AnimatedFormContent id={disclosureId} labelledBy={`${disclosureId}-trigger`} isOpen={expanded}>
      <div className="space-y-2 border-t border-[var(--ui-border-subtle)] px-3 py-3 text-xs text-[var(--ui-text-secondary)] lg:px-4">{children}</div>
    </AnimatedFormContent> : null}
  </article>;

  function detailToggle() {
    return <Button type="button" id={`${disclosureId}-trigger`} size="sm" variant="ghost" className="col-start-1 row-start-1 size-11 p-0" aria-label={t("planning.detailsNamed", { name: title })} aria-expanded={expanded} aria-controls={disclosureId} onClick={() => setExpanded(!expanded)}><ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}/></Button>;
  }
  function rowActions() {
    return <Popover.Root><Popover.Trigger asChild><Button ref={actionsRef} size="sm" variant="ghost" className="col-start-3 row-start-1 size-11 p-0" aria-label={t("projectWorkspace.actionsFor", { name: title })}><MoreHorizontal aria-hidden="true" className="size-4"/></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={4} collisionPadding={8} aria-label={t("projectWorkspace.actionsFor", { name: title })} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
      {([[onEdit, "edit"], [onMatch, "planning.match"], [onCloseRemainder, "settlement.closeRemainder"]] as const).map(([action, label]) => action ? <Popover.Close asChild key={label}><button type="button" className={actionClass} onClick={() => { actionsRef.current?.focus(); action(); }}>{t(label)}</button></Popover.Close> : null)}
      {tripHref ? <Link href={tripHref} className={actionClass}>{t("trips.title")}</Link> : null}
      {onCancel ? <Popover.Close asChild><button type="button" className={`${actionClass} border-t border-[var(--ui-border-subtle)] !text-[var(--ui-danger-text)]`} onClick={() => { actionsRef.current?.focus(); onCancel(); }}>{t("project.cancelExpectation")}</button></Popover.Close> : null}
    </Popover.Content></Popover.Portal></Popover.Root>;
  }
}
