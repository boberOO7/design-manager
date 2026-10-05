"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import type { FinanceCurrency } from "@/lib/finance";
import { formatFinanceAmount } from "@/lib/finance";
import { formatProjectFinanceMoney, type ProjectFinanceDisplay } from "@/lib/finance-project-view";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { ReceiptForm } from "./project-profitability-section";

export function ProjectCashWorkspace({ data, currencies, projectId, display, onMatch, compact = false }: {
  compact?: boolean; data: FinanceProjectCash; currencies: FinanceCurrency[]; projectId: string; display?: ProjectFinanceDisplay; onMatch: (movementId: string) => void;
}) {
  const t = useTranslations("Finance.projectWorkspace"), profit = useTranslations("Finance.profitability"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [studioPool, setStudioPool] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null), [pending, setPending] = useState(false);
  const relatedIds = new Set([...data.settlementIds, ...data.events.filter(event => event.project_id === projectId).map(event => event.movement_id)]);
  const related = data.receipts.filter(receipt => relatedIds.has(receipt.id) || receipt.items.some(item => item.projectId === projectId));
  const attention = related.filter(receipt => data.actionableIds.includes(receipt.id));
  const receipts = studioPool ? data.receipts : related;
  const selected = data.receipts.find(receipt => receipt.id === selectedId);
  const money = (value: string, code: string) => {
    const currency = currencies.find(unit => unit.code === code);
    return currency ? formatFinanceAmount(value, currency, locale) : `${value} ${code}`;
  };
  const displayMoney = (value: string, code: string) => formatProjectFinanceMoney(value, currencies.find(unit => unit.code === code), display, locale);
  const close = () => { if (pending) return; setOpen(false); setSelectedId(null); setStudioPool(false); };
  return <>
    {compact ? <Button variant="ghost" size="compact" className="min-w-11 sm:min-w-0" aria-label={attention.length ? `${t("reviewCash")} · ${t("projectCashAttention", { count: attention.length })}` : t("cashActions")} onClick={() => setOpen(true)}><ReceiptText aria-hidden="true" className="size-4 sm:hidden"/><span className="hidden sm:inline">{t(attention.length ? "reviewCash" : "cashActions")}</span>{attention.length ? <span>{attention.length}</span> : null}</Button> : <div className={`flex flex-wrap items-center justify-between gap-2 text-sm ${attention.length ? "order-last w-full rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 py-2" : "order-last ml-auto sm:order-none sm:ml-0"}`}>
      {attention.length ? <p>{t("projectCashAttention", { count: attention.length })}</p> : null}
      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(true)}>{t(attention.length ? "reviewCash" : "cashActions")}</Button>
    </div>}
    <Dialog isOpen={open} closeDisabled={pending} onRequestClose={close} title={t("assignCash")} closeLabel={t("close")} className="sm:max-w-[42rem]">
      <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("cashDistinction")}</p>
        {selected ? <>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} disabled={pending}>{t("backToCash")}</Button>
          <h3 className="font-semibold">{selected.description}</h3>
          <p className="text-xs text-[var(--ui-text-secondary)]">{formatDateOnly(selected.date, locale)} · {t("cashAvailable")}: {money(selected.remaining, selected.currency)}</p>
          <ReceiptForm key={`${selected.id}:${selected.revision}`} receipt={selected} data={{ currencies, projects: data.projects }} projectId={projectId} bare onPending={setPending} onSaved={() => { setSelectedId(null); router.refresh(); }}/>
          <AnimatedDisclosure title={profit("cashHistory", { count: data.cashHistory.filter(item => item.movementId === selected.id).length })}>
            <ol className="divide-y divide-[var(--ui-border-subtle)]">{data.cashHistory.filter(item => item.movementId === selected.id).map(item => <li key={item.id} className="space-y-1 py-3 text-xs">
              <p>{formatDateOnly(item.createdAt.slice(0, 10), locale)} · {item.actor}</p><p>{item.reason}</p>
              {item.items.length ? item.items.map(split => <p key={split.projectId}>{data.projects.find(project => project.id === split.projectId)?.name ?? profit("projectUnavailable")}: {money(split.amount, item.currency)}</p>) : <p>{profit("cashHistoryCleared")}</p>}
            </li>)}</ol>
          </AnimatedDisclosure>
        </> : <>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t(studioPool ? "studioCashPool" : "projectCash")}</h3><Button variant="outline" size="sm" onClick={() => setStudioPool(!studioPool)}>{t(studioPool ? "projectCash" : "findStudioCash")}</Button></div>
          {studioPool ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("studioCashHelp")}</p> : null}
          {receipts.length ? <ul className="divide-y divide-[var(--ui-border)]">{receipts.map(receipt => <li key={receipt.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{receipt.description}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{formatDateOnly(receipt.date, locale)}</p></div><span className="ui-numeric text-right text-sm font-semibold">{displayMoney(data.nativeUnapplied[receipt.id] ?? receipt.remaining, receipt.currency)}{display && receipt.currency !== display.currency.code ? <span className="mt-1 block text-xs font-normal text-[var(--ui-text-muted)]">{money(data.nativeUnapplied[receipt.id] ?? receipt.remaining, receipt.currency)}</span> : null}</span></div>
            {data.nativeUnapplied[receipt.id] ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("nativeAdvance")}</p> : null}
            <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedId(receipt.id)}>{t("assignCash")}</Button>{/[1-9]/.test(receipt.remaining) ? <Button size="sm" variant="ghost" onClick={() => { close(); onMatch(receipt.id); }}>{t("matchCash")}</Button> : null}</div>
          </li>)}</ul> : <p className="text-sm text-[var(--ui-text-muted)]">{t("noProjectCash")}</p>}
        </>}
      </div>
    </Dialog>
  </>;
}
