"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDateOnly } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { ProjectWorkspaceLink as Link } from "@/components/projects/project-workspace-navigation";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import type { FinanceProjectData } from "@/data/queries/finance";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { formatProjectFinanceMoney, projectAgreementName, scopeProjectFinance, type ProjectFinanceDisplay } from "@/lib/finance-project-view";

export function ProjectFinanceOverview({ project, cashData, currencies, display }: { project: FinanceProjectData; cashData?: FinanceProjectCash | null; currencies: FinanceCurrency[]; display?: ProjectFinanceDisplay }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const money = (value: string | number | null, code: string | null) => {
    const currency = currencies.find(currency => currency.code === code);
    if (currency && value !== null && display && code !== display.currency.code && !display.rates[currency.code]) return formatFinanceAmount(value, currency, locale);
    return formatProjectFinanceMoney(value, currency, display, locale);
  };
  const nativeMoney = (amount: string, code: string) => {
    const currency = currencies.find(currency => currency.code === code);
    return currency ? formatFinanceAmount(amount, currency, locale) : `${amount} ${code}`;
  };
  const shared = project.orders.filter(order => order.status !== "discarded" && project.directionLinks.filter(link => link.order_id === order.id).length > 1);
  const relatedIds = new Set([...(cashData?.settlementIds ?? []), ...(cashData?.events.filter(event => event.project_id === project.projectId).map(event => event.movement_id) ?? [])]);
  const receipts = cashData?.receipts.filter(receipt => relatedIds.has(receipt.id) || receipt.items.some(item => item.projectId === project.projectId)) ?? [];
  const cash = currencies.flatMap(currency => {
    const events = cashData?.events.filter(event => event.project_id === project.projectId && event.currency === currency.code) ?? [];
    return events.length ? [{ currency, amount: financeAmountText(events.reduce((sum, event) => sum + financeAmountUnits(event.amount, currency.minor_units), BigInt(0)), currency.minor_units) }] : [];
  });
  return <section className="space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5" data-project-finance-overview>
    <h2 className="text-base font-semibold">{t("agreements.projectOverview")}</h2>
    <div className="divide-y divide-[var(--ui-border-subtle)]">
      {project.directions.map(direction => {
        const scope = scopeProjectFinance(project, direction.id, currencies);
        return <Link key={direction.id} href={`/projects/${project.projectId}?view=finance&workDirection=${direction.id}`} className="flex min-h-12 items-center gap-3 rounded-[var(--ui-radius-control)] py-2 text-sm transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none">
          <span className="min-w-0 flex-1 break-words font-medium">{direction.name ?? t(direction.kind ? `directionWorkspace.kinds.${direction.kind}` : "orders.defaultDirectionName")}</span>
          <span className="ui-numeric text-right text-xs text-[var(--ui-text-secondary)]">{scope.totals.length ? scope.totals.map(total => <span key={total.currency} className="block">{money(total.contract_gross_amount, total.currency)}</span>) : t(scope.orders.some(order => order.status === "confirmed") ? "agreements.sharedOnly" : "agreements.noTerms")}</span>
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-muted)]"/>
        </Link>;
      })}
      {shared.map(order => {
        const total = project.orderTotals.find(total => total.order_id === order.id);
        return <div key={order.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 text-sm" data-shared-agreement={order.id}><div className="min-w-0"><p className="break-words font-medium">{projectAgreementName(order.name, t("orders.defaultName"))}</p><p className="mt-0.5 text-xs text-[var(--ui-text-secondary)]">{t("agreements.sharedScope", { names: project.directionLinks.filter(link => link.order_id === order.id).flatMap(link => project.directions.find(direction => direction.id === link.direction_id) ?? []).map(direction => direction.name ?? t(direction.kind ? `directionWorkspace.kinds.${direction.kind}` : "orders.defaultDirectionName")).join(", ") })}</p></div><span className="ui-numeric text-xs">{total ? money(total.contract_gross_amount, total.currency) : t("orders.status.draft")}</span></div>;
      })}
    </div>
    {shared.length ? <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("agreements.projectSharedHelp")}</p> : null}
    <AnimatedDisclosure title={t("agreements.cashAndObligations")}>
      <div className="space-y-3 pb-2">
        <div className="space-y-2"><h3 className="text-sm font-medium">{t("agreements.actualCash")}</h3>
          {receipts.length ? <ul className="divide-y divide-[var(--ui-border-subtle)]">{receipts.map(receipt => <li key={receipt.id} className="flex min-h-10 flex-wrap items-baseline justify-between gap-2 py-2 text-xs"><span className="min-w-0 break-words">{formatDateOnly(receipt.date, locale)} · {receipt.description}</span><span className="ui-numeric whitespace-nowrap">{nativeMoney(receipt.remaining, receipt.currency)}</span></li>)}</ul> : <p className="text-xs text-[var(--ui-text-secondary)]">{t("agreements.noReceipts")}</p>}
          <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("agreements.cashHelp")}</p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><dt className="text-[var(--ui-text-secondary)]">{t("agreements.attributedCash")}</dt>{cash.length ? cash.map(row => <dd key={row.currency.code} className="ui-numeric font-medium">{formatFinanceAmount(row.amount, row.currency, locale)}</dd>) : <dd>{t("agreements.notAttributed")}</dd>}</dl>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[var(--ui-text-secondary)]"><tr><th className="py-2 pr-4 font-medium">{t("agreements.incomeAndCosts")}</th><th className="px-2 py-2 text-right font-medium">{t("agreements.matched")}</th><th className="px-2 py-2 text-right font-medium">{t("agreements.due")}</th><th className="py-2 pl-2 text-right font-medium">{t("project.planned")}</th></tr></thead><tbody className="divide-y divide-[var(--ui-border-subtle)]">{project.totals.map(total => <tr key={`${total.stream}-${total.currency}`}><th className="py-2 pr-4 font-medium">{t(`project.streams.${total.stream}`)} · {total.currency}</th><td className="ui-numeric whitespace-nowrap px-2 py-2 text-right">{money(total.collected_amount, total.currency)}</td><td className="ui-numeric whitespace-nowrap px-2 py-2 text-right">{money(total.outstanding_amount, total.currency)}</td><td className="ui-numeric whitespace-nowrap py-2 pl-2 text-right">{money(total.planned_amount, total.currency)}</td></tr>)}</tbody></table></div>
        <Link href={`/projects/${project.projectId}?view=finance&workDirection=all&financeTab=result`} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium underline underline-offset-4">{t("agreements.recognizedResult")}<ChevronRight aria-hidden="true" className="size-3.5"/></Link>
      </div>
    </AnimatedDisclosure>
  </section>;
}
