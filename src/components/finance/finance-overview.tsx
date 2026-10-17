"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CalendarClock, CircleCheck, Wallet } from "lucide-react";
import { formatFinanceAmount, formatFinanceDecimal, type FinanceCurrency } from "@/lib/finance";
import type { FinanceOverview } from "@/lib/finance-overview";
import { overviewActualCash, overviewSignedAmount, overviewScheduledCash, overviewAmountTotal, overviewAttentionGroups, overviewIssueHref, overviewPaymentBuckets, overviewPaymentGroups, overviewUncertainExpectations, type OverviewCashComparison, type OverviewCashMonth, type OverviewPayment, type OverviewPaymentGroup } from "@/lib/finance-overview-dashboard";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Panel } from "@/components/ui/panel";
import { StatisticsMotion } from "@/components/statistics/statistics-motion";
import { OverviewDetail } from "./overview-detail";
import { OverviewCashChart, cashOutColor } from "./overview-cash-chart";
import { overviewLink } from "./finance-analytics";
import { formatDateOnly } from "@/lib/utils";

const focus = "rounded-[var(--ui-radius-control)] transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none";

export function FinanceOverviewCash({ source, data, currencies, payments, monthlyCash, comparison }: {
  source: FinanceOverview; data: FinanceOverview; currencies: FinanceCurrency[]; payments: OverviewPayment[] | null; monthlyCash: OverviewCashMonth[] | null; comparison: OverviewCashComparison | null;
}) {
  const t = useTranslations("Finance.overview.dashboard"), o = useTranslations("Finance.overview"), ft = useTranslations("Finance"), locale = useLocale();
  const searchParams = useSearchParams();
  const [months, setMonths] = useState<"6" | "12">("6");
  const currency = currencies.find(unit => unit.code === data.forecast.currency);
  if (!currency) throw new Error("Unknown Finance reporting currency");
  const money = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale, "decimal");
  const signed = (value: string | null, direction: "received" | "spent" | "net") => {
    if (value === null) return "—";
    const { sign, absolute } = overviewSignedAmount(value, direction);
    return `${sign}${money(absolute)}`;
  };
  const scheduled = overviewScheduledCash(payments, data.forecast.asOf, currency.minor_units);
  const date = (value: string) => formatDateOnly(value, locale);
  const href = (period: string) => { const params = new URLSearchParams(searchParams.toString()); params.set("period", period); return `/finance?${params}`; };
  const cash = overviewActualCash(data.flows, currency.minor_units);
  const buckets = overviewPaymentBuckets(payments ?? [], data.forecast.asOf);
  const uncertain = overviewUncertainExpectations(payments ?? [], source.forecast.issues, data.forecast.asOf);
  const attention = overviewAttentionGroups(payments ?? [], source.forecast.issues, data.forecast.asOf);
  const total = (items: OverviewPayment[]) => payments === null ? null : overviewAmountTotal(items.map(item => item.reportingAmount), currency.minor_units);
  const groups = (items: OverviewPayment[], overdue = false) => overviewPaymentGroups(items, currency.minor_units, overdue);
  const upcoming = { incoming: buckets.upcoming.filter(item => item.direction === "incoming"), outgoing: buckets.upcoming.filter(item => item.direction === "outgoing") };
  const populated = (["incoming", "outgoing"] as const).filter(direction => upcoming[direction].length);
  const points = monthlyCash?.slice(-Number(months));
  const selection = "inline-flex min-h-9 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-xs font-medium transition-colors duration-[180ms] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none";
  const activeSelection = "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]";
  const inactiveSelection = "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)]";
  return <div className="space-y-4" data-testid="finance-cash">
    <section aria-label={t("actual")} data-testid="overview-actual">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted)]"><CalendarClock className="size-3.5" aria-hidden="true"/><span>{date(data.actualFrom)} — {date(data.forecast.asOf)}</span><OverviewDetail info title={t("actual")}><p>{t("actualHelp")}</p><p>{t("notProfit")}</p></OverviewDetail></div>
        <nav aria-label={o("actualPeriod")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-1">{(["month", "3", "year"] as const).map(period => <Link scroll={false} key={period} href={href(period)} aria-current={data.period === period ? "page" : undefined} className={`${selection} ${data.period === period ? activeSelection : inactiveSelection}`}>{t(`periods.${period}`)}</Link>)}</nav>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {([
          { label: "balance", amount: data.forecast.cashIncomplete ? null : data.forecast.cashBase, icon: Wallet, color: "var(--ui-info-text)", surface: "var(--ui-info-surface)" },
          { label: "received", amount: cash.incoming, icon: ArrowDownLeft, color: "var(--ui-success-text)", surface: "var(--ui-success-surface)" },
          { label: "spent", amount: cash.outgoing, icon: ArrowUpRight, color: cashOutColor, surface: "color-mix(in srgb, light-dark(#d97732, #f0a365) 12%, var(--ui-surface))" },
          { label: "net", amount: cash.net, icon: ArrowLeftRight, color: cash.net?.startsWith("-") ? cashOutColor : /[1-9]/.test(cash.net ?? "") ? "var(--ui-success-text)" : "var(--ui-text-secondary)", surface: "var(--ui-surface-muted)" },
        ] as const).map(({ label, amount, icon: Icon, color, surface }) => <Panel key={label} className="min-w-0 p-4 transition-colors duration-[180ms] hover:border-[var(--ui-border-strong)] motion-reduce:transition-none xl:p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-medium text-[var(--ui-text-secondary)]">{t(label)}</h2><span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)]" style={{ color, background: surface }}><Icon aria-hidden="true" className="size-4"/></span></div>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 font-semibold tracking-tight tabular-nums" data-testid={label === "balance" ? "overview-balance" : `actual-${label}`}><span className="break-all text-[clamp(1.4rem,2.2vw,2rem)] leading-tight" style={{ color: label === "net" ? color : undefined }}>{label === "balance" ? money(amount) : signed(amount, label)}</span><span className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{currency.code}</span></p>
          <div className="mt-2 text-xs text-[var(--ui-text-muted)]">{label === "balance" ? <OverviewDetail title={t("accounts")}>
            <p className="mb-2 text-xs text-[var(--ui-text-muted)]">{t("recordedAsOf", { date: date(data.forecast.asOf) })}</p>
            {data.forecast.cashIncomplete ? <p className="text-xs text-[var(--ui-warning-text)]">{t("balanceIncomplete")}</p> : null}
            <dl className="divide-y divide-[var(--ui-border-subtle)]">{data.accounts.map(account => {
              const unit = currencies.find(unit => unit.code === account.currency);
              return <div key={account.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="min-w-0 break-words text-[var(--ui-text-secondary)]">{account.name}</dt><dd className="text-right tabular-nums">{unit ? formatFinanceAmount(account.native, unit, locale, "decimal") : "—"} {account.currency}{account.currency !== currency.code ? <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{money(account.amount)} {currency.code}</span> : null}</dd></div>;
            })}</dl><Link href="/finance/accounts" className={overviewLink}>{t("allAccounts")}</Link>
          </OverviewDetail> : comparison?.[label] ? <div className="flex items-center gap-x-1.5 [&>button]:size-7">
            <span className="font-medium tabular-nums" style={{ color: /[1-9]/.test(comparison[label].delta) ? (comparison[label].delta.startsWith("-") === (label === "spent") ? "var(--ui-success-text)" : cashOutColor) : undefined }}>
              {comparison[label].percent === null ? `${signed(comparison[label].delta, "net")} ${currency.code}` : `${overviewSignedAmount(comparison[label].percent, "net").sign}${formatFinanceDecimal(overviewSignedAmount(comparison[label].percent, "net").absolute, locale, { maximumFractionDigits: 1 })}%`}
            </span><span>{t("vsPrevious")}</span><OverviewDetail info title={t("comparison")}><p className="text-xs">{date(comparison.from)} — {date(comparison.through)}</p><p className="mt-2 text-sm font-medium">{t(label)}: {money(comparison[label].previous)} {currency.code}</p><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("comparisonHelp")}</p></OverviewDetail>
          </div> : <span className="inline-flex min-h-6 items-center">{t(`periods.${data.period}`)}</span>}</div>
        </Panel>)}
      </div>
      {cash.net === null ? <Link href="/finance/movements" className={`${overviewLink} mt-2 text-xs text-[var(--ui-warning-text)]`}>{t("actualIncomplete")}</Link> : null}
    </section>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
      <StatisticsMotion section="overview" period={months}>
        <Panel data-statistics-reveal="0" className="min-w-0" data-testid="overview-dynamics">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-5 py-3">
            <div className="flex items-center gap-1"><h2 className="text-base font-semibold">{t("dynamics")}</h2><OverviewDetail info title={t("dynamics")}><p>{t("actualHelp")}</p><p>{t("refundHelp")}</p><p>{t("recordedHistory")}</p></OverviewDetail></div>
            <div role="group" aria-label={t("dynamicsPeriod")} className="flex gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["6", "12"] as const).map(value => <button key={value} type="button" aria-pressed={months === value} onClick={() => setMonths(value)} className={`${selection} ${months === value ? activeSelection : inactiveSelection}`}>{t("months", { count: Number(value) })}</button>)}</div>
          </div>
          <div className="p-5 pb-2">
            <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-[var(--ui-text-muted)]"><span>{points?.length ? `${date(points[0].month)} — ${date(data.forecast.asOf)}` : t("actual")}</span><span>{t("partialMonth")}</span></div>
            {points ? <OverviewCashChart key={`${months}-${currency.code}`} points={points} currency={currency}/> : <p role="status" className="py-12 text-sm text-[var(--ui-text-secondary)]">{t("chartFailed")}</p>}
            {points?.some(point => point.net === null) ? <Link href="/finance/movements" className={`${overviewLink} text-xs text-[var(--ui-warning-text)]`}>{t("actualIncomplete")}</Link> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-[var(--ui-border)] px-5 py-2">
            <OverviewDetail title={t("cashComposition")}><p className="mb-3 text-xs text-[var(--ui-text-muted)]">{date(data.actualFrom)} — {date(data.forecast.asOf)} · {currency.code}</p><table className="w-full text-left text-xs"><thead><tr className="text-[var(--ui-text-muted)]"><th className="pb-2 font-normal">{t("movementType")}</th><th className="pb-2 text-right font-normal">{t("received")}</th><th className="pb-2 text-right font-normal">{t("spent")}</th></tr></thead><tbody>{cash.breakdown.map(row => <tr key={row.nature} className="border-t border-[var(--ui-border-subtle)]"><th className="py-2 font-normal">{ft(`movements.natures.${row.nature}`)}</th><td className="py-2 text-right tabular-nums">{money(row.incoming)}</td><td className="py-2 text-right tabular-nums">{money(row.outgoing)}</td></tr>)}</tbody></table></OverviewDetail>
            <Link href="/finance/movements" className={`${overviewLink} text-xs`}>{t("openMovements")}<ArrowUpRight className="ml-1 size-3" aria-hidden="true"/></Link>
          </div>
        </Panel>
      </StatisticsMotion>

      <Panel aria-labelledby="overview-attention-heading" id="overview-attention" className="min-w-0">
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-4"><h2 id="overview-attention-heading" className="text-base font-semibold">{t("attention")}</h2><CalendarClock aria-hidden="true" className="size-4 text-[var(--ui-text-muted)]"/></div>
        <div className="px-5">
          {(["incoming", "outgoing"] as const).map(direction => {
            const items = buckets.overdue.filter(item => item.direction === direction), rows = groups(items, true);
            return <div key={direction} className="border-b border-[var(--ui-border-subtle)] py-3" data-testid={`overdue-${direction}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-xs text-[var(--ui-text-secondary)]">{t(direction === "incoming" ? "overdueIn" : "overdueOut")}</h3><p className={`text-lg font-semibold tabular-nums ${rows.length ? "text-[var(--ui-warning-text)]" : "text-[var(--ui-text-muted)]"}`}>{money(total(items))} <span className="text-xs font-normal text-[var(--ui-text-muted)]">{currency.code}</span></p></div>
              {rows.length ? <AnimatedDisclosure title={t("viewOverdue")} className="[&>button]:min-h-8 [&>button]:text-xs"><div className="max-h-64 overflow-y-auto pr-1"><PaymentRows groups={rows} currencies={currencies} currency={currency} overdue/></div><Link href={`/finance/expected?filter=${direction}&attention=overdue`} className={`${overviewLink} text-xs`}>{t("allPayments")}</Link></AnimatedDisclosure> : null}
            </div>;
          })}
          {(["dates", "blockers", "unscheduled"] as const).map(category => {
            const entries = attention[category];
            if (!entries.length) return null;
            return <div key={category} className={`border-b border-[var(--ui-border-subtle)] py-1 last:border-b-0 ${category === "unscheduled" ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-warning-text)]"}`} data-testid={`attention-${category}`}>
              <AnimatedDisclosure title={t(`attentionGroups.${category}`, { count: entries.length })} className="[&>button]:text-xs [&>button]:text-inherit">
                <p className="mb-2 text-xs leading-5 text-[var(--ui-text-muted)]">{t(`attentionHelp.${category}`)}</p>
                <div className="max-h-64 overflow-y-auto pr-1">{entries.map(group => <AnimatedDisclosure key={group.id} title={`${group.label || t("payment")}${group.entries.length > 1 ? ` · ${group.entries.length}` : ""}`} className="border-t border-[var(--ui-border-subtle)] [&>button]:text-xs">
                  <ul className="space-y-2 pb-3">{group.entries.map(({ issue, reasons, payment }) => <li key={`${issue.source}:${issue.id}`} className="text-xs">
                    <Link href={overviewIssueHref(issue)} className={`${focus} block py-1 font-medium underline decoration-[var(--ui-border-strong)] underline-offset-4`}>{payment?.description || issue.label || t("payment")}</Link>
                    <p className="text-[var(--ui-text-muted)]">{reasons.map(reason => t(`gaps.${reason}`)).join(" · ")}{issue.date ? ` · ${date(issue.date)}` : ""}</p>
                    {payment ? <p className="mt-1 tabular-nums text-[var(--ui-text-secondary)]">{payment.reportingAmount === null ? `${payment.amount} ${payment.currency}` : `${money(payment.reportingAmount)} ${currency.code}`}</p> : null}
                  </li>)}</ul>
                </AnimatedDisclosure>)}</div>
              </AnimatedDisclosure>
            </div>;
          })}
          {payments !== null && !buckets.overdue.length && !attention.dates.length && !attention.blockers.length ? <p className="flex items-center gap-2 py-4 text-xs text-[var(--ui-text-muted)]"><CircleCheck className="size-4 text-[var(--ui-success-text)]" aria-hidden="true"/>{t("noUrgentIssues")}</p> : null}
          {payments === null ? <p role="status" className="py-4 text-xs text-[var(--ui-warning-text)]">{t("paymentsFailed")}</p> : null}
        </div>
      </Panel>
    </div>

    <Panel aria-labelledby="overview-payments-heading" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-5 py-4"><h2 id="overview-payments-heading" className="text-base font-semibold">{t("next30")}</h2><p className="text-xs text-[var(--ui-text-muted)]">{date(data.forecast.asOf)} — {date(buckets.through)}</p></div>
      <div className="grid divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">{(["incoming", "outgoing", "net"] as const).map(direction => {
        const isNet = direction === "net";
        const items = isNet ? [] : upcoming[direction];
        const amount = scheduled[direction];
        const knownOnly = !isNet && uncertain[direction];
        const displayAmount = knownOnly && amount !== null && !/[1-9]/.test(amount) ? null : amount;
        const label = isNet ? "scheduledNet" : direction === "incoming" ? "expectedIn" : "expectedOut";
        const Icon = isNet ? ArrowLeftRight : direction === "incoming" ? ArrowDownLeft : ArrowUpRight;
        return <div key={direction} className="min-w-0 px-5 py-3" data-testid={`upcoming-${direction}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-medium text-[var(--ui-text-secondary)]"><Icon aria-hidden="true" className="size-3.5" style={{ color: direction === "incoming" ? "var(--ui-success-text)" : direction === "outgoing" ? cashOutColor : "var(--ui-info-text)" }}/>{t(label)}</h3><OverviewDetail info title={t(label)}><p className="text-xs leading-5">{t(isNet ? "scheduledHelp" : knownOnly ? "knownDated" : amount === null ? "totalIncomplete" : "scheduledPaymentsHelp")}</p></OverviewDetail></div>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold tracking-tight tabular-nums" style={{ color: isNet ? amount?.startsWith("-") ? cashOutColor : "var(--ui-success-text)" : undefined }}>{signed(displayAmount, isNet ? "net" : direction === "incoming" ? "received" : "spent")} <span className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{currency.code}</span></p>
          <div className="mt-1 flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs text-[var(--ui-text-muted)]">{isNet ? <span>{t("scheduledOnly")}</span> : <><span>{items.length ? t("paymentCount", { count: groups(items).length }) : t(direction === "incoming" ? "emptyIncoming" : "emptyOutgoing")}</span><Link href={`/finance/expected?filter=${direction}&period=30days`} className={`${overviewLink} text-xs`}>{t("allPayments")}</Link></>}</div>
        </div>;
      })}</div>
      {payments === null ? <p role="status" className="border-t border-[var(--ui-border)] px-5 py-3 text-sm text-[var(--ui-warning-text)]">{t("paymentsFailed")} <Link href="/finance/expected" className={overviewLink}>{o("allExpected")}</Link></p> : null}
      {populated.length ? <div className={`grid border-t border-[var(--ui-border)] ${populated.length === 2 ? "divide-y divide-[var(--ui-border)] lg:grid-cols-2 lg:divide-x lg:divide-y-0" : ""}`}>{populated.map(direction => <div key={direction} className="min-w-0 px-5 py-2" data-testid={`upcoming-${direction}-items`}>
        <PaymentRows groups={groups(upcoming[direction])} currencies={currencies} currency={currency} compact columns={populated.length === 1}/>
      </div>)}</div> : null}
    </Panel>
  </div>;
}


function PaymentRows({ groups, currency, currencies, overdue = false, compact = false, columns = false }: { groups: OverviewPaymentGroup[]; currency: FinanceCurrency; currencies: FinanceCurrency[]; overdue?: boolean; compact?: boolean; columns?: boolean }) {
  const t = useTranslations("Finance.overview.dashboard"), f = useTranslations("Finance"), locale = useLocale();
  const money = (amount: string | null) => amount === null ? "—" : formatFinanceAmount(amount, currency, locale, "decimal");
  const date = (value: string) => formatDateOnly(value, locale);
  const nativeMoney = (item: OverviewPayment) => {
    const unit = currencies.find(unit => unit.code === item.currency);
    return `${unit ? formatFinanceAmount(item.amount, unit, locale, "decimal") : item.amount} ${item.currency}`;
  };
  const component = (item: OverviewPayment) => {
    if (item.component && ["payout", "deductions", "employer_cost", "recurring", "bonus"].includes(item.component)) return f(`schedules.components.${item.component}`);
    return item.description || t("payment");
  };
  const row = (group: OverviewPaymentGroup) => {
    const item = group.first, payroll = item.obligation?.kind === "payroll";
    const title = payroll ? item.obligation?.employee_name || item.description : item.description || t("payment");
    const context = payroll ? t("payrollPeriod", { period: item.obligation?.period_start.slice(0, 7) ?? "" }) : item.project?.name || (item.obligation?.kind === "recurring" ? t("recurring") : t("payment"));
    return <li key={group.id} className={compact ? "py-2" : "py-3"}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/finance/expected?item=${item.id}`} className={`${focus} inline-flex min-h-6 items-center break-words text-sm font-medium`}>{title}</Link><p className="mt-0.5 break-words text-xs text-[var(--ui-text-secondary)]">{context}{group.from ? ` · ${date(group.from)}${group.to !== group.from && group.to ? ` – ${date(group.to)}` : ""}` : ""}</p>{group.estimated ? <span className="mt-1 inline-block text-xs text-[var(--ui-text-muted)]">{t("estimate")}</span> : null}</div><div className="shrink-0 text-right text-sm font-medium tabular-nums">{money(group.amount)} <span className="text-xs font-normal text-[var(--ui-text-muted)]">{currency.code}</span>{group.amount === null && group.items.length === 1 ? <span className="mt-1 block text-xs font-normal text-[var(--ui-text-secondary)]">{nativeMoney(item)}</span> : null}</div></div>
      {group.items.length > 1 ? <AnimatedDisclosure title={t("components", { count: group.items.length })}><ul className="space-y-1 pb-1">{group.items.map(child => <li key={child.id}><Link href={`/finance/expected?item=${child.id}`} className={`${focus} flex min-h-10 items-center justify-between gap-3 text-xs text-[var(--ui-text-secondary)]`}><span>{component(child)}</span><span className="text-right tabular-nums">{child.reportingAmount === null ? `${child.amount} ${child.currency}` : `${money(child.reportingAmount)} ${currency.code}`}</span></Link></li>)}</ul></AnimatedDisclosure> : null}
    </li>;
  };
  return <><ul className={columns ? "grid gap-x-6 divide-y divide-[var(--ui-border-subtle)] sm:grid-cols-2 [&>li]:border-b [&>li]:border-[var(--ui-border-subtle)] sm:[&>li:nth-child(2)]:border-t-0" : "divide-y divide-[var(--ui-border-subtle)]"}>{groups.slice(0, 4).map(row)}</ul>{groups.length > 4 ? <Link href={`/finance/expected?filter=${groups[0].first.direction}&${overdue ? "attention=overdue" : "period=30days"}`} className={`${overviewLink} min-h-10 text-xs`}>{t("morePayments", { count: groups.length - 4 })} <ArrowUpRight aria-hidden="true" className="ml-1 size-3"/></Link> : null}</>;
}
