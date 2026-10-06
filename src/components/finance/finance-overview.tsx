"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import type { FinanceOverview } from "@/lib/finance-overview";
import { financeOverviewCashRisk } from "@/lib/finance-analytics";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceCashChart } from "./cash-chart";
import { overviewLink } from "./finance-analytics";
import { formatDateOnly } from "@/lib/utils";

export function FinanceOverviewCash({ source, data, currencies, invalidFx }: { source: FinanceOverview; data: FinanceOverview; currencies: FinanceCurrency[]; invalidFx: boolean }) {
  const t = useTranslations("Finance.overview"), a = useTranslations("Finance.overview.analytics"), f = useTranslations("Finance.forecast"), ft = useTranslations("Finance"), locale = useLocale();
  const report = data.forecast, currency = currencies.find(c => c.code === report.currency);
  if (!currency) throw new Error("Unknown Finance reporting currency");
  const money = (value: string | null, code = report.currency) => {
    const unit = currencies.find(c => c.code === code);
    return value === null || !unit ? "—" : formatFinanceAmount(value, unit, locale, "decimal");
  };
  const date = (value: string) => formatDateOnly(value, locale);
  const params = new URLSearchParams({ horizon: source.forecast.horizon, scenario: source.forecast.scenario });
  source.forecast.fx.filter(fx => fx.source !== "identity").forEach(fx => params.set(`fx_${fx.currency}`, fx.rate));
  const planningHref = `/finance/planning?${params}`;
  const risk = financeOverviewCashRisk(source), incomplete = risk.incomplete || invalidFx;
  const known = (value: string, partial: boolean) => partial && !/[1-9]/.test(value) ? null : value;
  const upcoming = report.items.filter(i => i.date && i.date >= report.asOf && i.date <= data.upcomingThrough).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
  const overdue = report.items.filter(i => i.dueDate && i.dueDate < report.asOf);
  const metrics = [
    { label: t("cash"), value: money(known(report.cashBase, report.cashIncomplete)), scope: `${t("today")} · ${date(report.asOf)}`, partial: report.cashIncomplete, href: "#overview-breakdown" },
    { label: t("outgoing"), value: money(known(data.outgoingTotal, data.outgoingIncomplete || incomplete)), scope: t("next30"), partial: data.outgoingIncomplete || incomplete, href: "/finance/expected?filter=outgoing&period=30days" },
    { label: t("overdue"), value: String(overdue.length), scope: t("overdueScope", { incoming: overdue.filter(i => i.direction === "incoming").length, outgoing: overdue.filter(i => i.direction === "outgoing").length }), partial: false, href: "/finance/expected?status=overdue" },
    { label: t("lowPoint"), value: money(known(data.lowPoint.amount, incomplete)), scope: `${date(data.lowPoint.date)} · ${date(report.through)}`, partial: incomplete, href: planningHref },
  ];
  return <section className="space-y-5 border-t border-[var(--ui-border-subtle)] pt-6" aria-labelledby="finance-cash-heading" data-testid="finance-cash">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><div><h2 id="finance-cash-heading" className="text-lg font-semibold">{a("cashOutlook")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{a("cashBasis")} · {report.currency} · {f(report.scenario)}</p></div><Link href={planningHref} className={overviewLink}>{t("fullForecast")}</Link></div>
    <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">{metrics.map((m, i) => <div key={m.label} className="min-w-0"><dt className="text-sm text-[var(--ui-text-secondary)]"><Link href={m.href} className={overviewLink}>{m.label}</Link></dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{m.value}{i !== 2 ? <span className="ml-1 text-xs font-normal text-[var(--ui-text-muted)]">{report.currency}</span> : null}</dd><dd className="mt-1 text-xs text-[var(--ui-text-muted)]">{m.scope}</dd>{m.partial ? <dd><Link href={planningHref} className={`${overviewLink} text-xs text-[var(--ui-warning-text)]`}>{t("knownSubtotal")}</Link></dd> : null}</div>)}</dl>
    <p className="text-xs text-[var(--ui-text-secondary)]">{a("forecastScope", { from: date(report.asOf), to: date(report.through) })} · {incomplete ? a("riskUnknown") : risk.firstDeficit ? a("firstDeficit", { date: date(risk.firstDeficit) }) : a("noDeficit")}</p>
    <div id="overview-breakdown"><AnimatedDisclosure title={t("breakdown")}><dl className="grid gap-3 py-2 sm:grid-cols-2 xl:grid-cols-3">{data.accounts.map(account => <div key={account.id} className="min-w-0"><dt className="text-sm text-[var(--ui-text-secondary)]">{account.name}</dt><dd className="break-words font-medium tabular-nums">{money(account.native, account.currency)} {account.currency}</dd>{account.currency !== report.currency ? <dd className="text-xs text-[var(--ui-text-muted)]">{money(account.amount)} {report.currency}</dd> : null}</div>)}</dl></AnimatedDisclosure></div>
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <div className="min-w-0"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-medium">{t("cashTrend")}</h3><span className="text-xs text-[var(--ui-text-muted)]">{t("next30")}</span></div><FinanceCashChart data={data} currency={currency} through={data.upcomingThrough} compact/>{data.historyIncomplete || data.movementValuationIncomplete ? <Link href={data.movementValuationIncomplete ? "/finance/movements" : "/finance/accounts"} className={`${overviewLink} text-xs text-[var(--ui-warning-text)]`}>{t("historyIncomplete")}</Link> : null}
        <AnimatedDisclosure title={t("netFlow")}><p className="mb-2 text-sm tabular-nums">{money(data.netFlow)} {report.currency} · {date(data.actualFrom)} – {date(report.asOf)}</p><dl className="space-y-2">{data.flows.filter(row => row.month.slice(0, 7) === report.asOf.slice(0, 7)).map(row => <div key={`${row.nature}-${row.direction}`} className="flex flex-wrap justify-between gap-2 text-xs"><dt>{ft(`movements.natures.${row.nature}`)} · {ft(`movements.kinds.${row.direction}`)}</dt><dd className="tabular-nums">{money(row.amount)} {report.currency}</dd></div>)}</dl><Link href="/finance/movements" className={overviewLink}>{t("allMovements")}</Link></AnimatedDisclosure>
      </div>
      <div className="min-w-0"><h3 className="text-sm font-medium">{t("upcoming")}</h3><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{date(report.asOf)} – {date(data.upcomingThrough)}</p><ul className="mt-2 divide-y divide-[var(--ui-border-subtle)]">{upcoming.slice(0, 5).map(item => <li key={item.id}><Link href={`/finance/expected?item=${item.id}`} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[var(--ui-radius-control)] py-3 text-sm transition-colors duration-[180ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"><span className="min-w-0"><span className="block break-words">{item.description || f("item")}</span><span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{date(item.date ?? report.asOf)}{item.dueDate && item.dueDate < report.asOf ? <span className="ml-2 text-[var(--ui-warning-text)]">{t("overdue")}</span> : null}</span></span><span className="text-right tabular-nums">{item.reportingAmount === null ? "—" : `${item.direction === "incoming" ? "+" : "−"}${money(item.reportingAmount)}`}<span className="block text-xs text-[var(--ui-text-muted)]">{report.currency}</span></span></Link></li>)}</ul>{!upcoming.length ? <p className="py-4 text-sm text-[var(--ui-text-secondary)]">{t("emptyUpcoming")}</p> : null}<Link href="/finance/expected" className={overviewLink}>{t("allExpected")}</Link>
        {report.issues.length || invalidFx ? <p><Link href={planningHref} className={`${overviewLink} text-xs text-[var(--ui-warning-text)]`}>{a("outlookIncomplete")}</Link></p> : null}
      </div>
    </div>
  </section>;
}
