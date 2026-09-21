"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ArrowRight, ChevronDown, Wallet, Activity, ArrowDownRight, Clock3, Check } from "lucide-react";
import { formatFinanceAmount, canChartFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceOverview } from "@/lib/finance-overview";
import type { getFinanceData } from "@/data/queries/finance";
import { forecastIssueHref } from "@/lib/finance-forecast";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/ui/panel";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceCashChart } from "./cash-chart";

const interactive = "transition-colors duration-[220ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none";
const textLink = `inline-flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] text-sm font-medium underline decoration-[var(--ui-border-strong)] underline-offset-4 ${interactive}`;

export function FinanceOverviewWorkspace({ data, categories, currencies, invalidFx }: { data: FinanceOverview; categories: NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["categories"]; currencies: FinanceCurrency[]; invalidFx: boolean }) {
  const t = useTranslations("Finance.overview"), ft = useTranslations("Finance"), f = useTranslations("Finance.forecast");
  const locale = useLocale();
  const [cashOpen, setCashOpen] = useState(false);
  const report = data.forecast;
  const currency = currencies.find(currency => currency.code === report.currency);
  if (!currency) throw new Error("Unknown Finance reporting currency");
  const amount = (value: string | null, code?: string) => {
    const unit = code ? currencies.find(currency => currency.code === code) : currency;
    return value === null || !unit ? "—" : formatFinanceAmount(value, unit, locale, code ? "currency" : "decimal");
  };
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(value.slice(0, 4) !== report.asOf.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const category = (id: string | null, name: string | null) => financeCategoryLabel(categories.find(c => c.id === id), name, key => ft(`planning.defaults.${key}`)) || f("unclassified");
  const upcoming = report.items.filter(i => i.date && i.date >= report.asOf && i.date <= data.upcomingThrough).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id.localeCompare(b.id));
  const overdue = report.items.filter(i => i.dueDate && i.dueDate < report.asOf).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const incomplete = report.cashIncomplete || report.issues.length > 0;
  const planningParams = new URLSearchParams({ horizon: report.horizon, scenario: report.scenario });
  report.fx.filter(fx => fx.source !== "identity").forEach(fx => planningParams.set(`fx_${fx.currency}`, fx.rate));
  const planningHref = `/finance/planning?${planningParams}`;
  const itemHref = (id: string) => `/finance/expected?item=${id}`;
  const attention = [
    ...overdue.map(i => ({ key: `overdue-${i.id}`, title: i.description || category(i.categoryId, null), note: `${t("overdue")} · ${date(i.dueDate ?? report.asOf)} · ${i.direction === "incoming" ? "+" : "−"}${amount(i.amount, i.currency)}`, href: itemHref(i.id) })),
    ...(data.historyIncomplete ? [{ key: "history", title: t("openingAttention"), note: ft("accounts"), href: "/finance/accounts" }] : []),
    ...(report.issues.some(i => i.reason === "missing_fx") || data.receivablesIncomplete || report.cashIncomplete || invalidFx ? [{ key: "fx", title: f("issues.missing_fx"), note: f("fxTitle"), href: planningHref }] : []),
    ...report.issues.filter(i => i.reason !== "missing_fx").sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((i, index) => ({ key: `issue-${index}`, title: i.label || f("item"), note: `${f(`issues.${i.reason}`)}${i.date ? ` · ${date(i.date)}` : ""}`, href: i.source === "expected" ? itemHref(i.id) : forecastIssueHref(i) })),
  ];
  const currentFlows = data.flows.filter(row => row.month.slice(0, 7) === report.asOf.slice(0, 7));
  const flowsSafe = currentFlows.every(row => canChartFinanceAmount(row.amount, currency.minor_units));
  const flowMax = Math.max(1, ...currentFlows.filter(row => row.nature === "operating").map(row => Math.abs(Number(row.amount))));
  const budgetSignals = data.categories.filter(row => row.budget !== null && row.variance !== null && /[1-9]/.test(row.variance)).slice(0, 3);
  const metrics = [
    { key: "cash" as const, value: amount(report.cashBase), partial: report.cashIncomplete, scope: `${t("today")} · ${date(report.asOf)}`, Icon: Wallet, tone: "", href: "" },
    { key: "netFlow" as const, value: `${data.netFlow.startsWith("-") ? "−" : /[1-9]/.test(data.netFlow) ? "+" : ""}${amount(data.netFlow.replace(/^-/, ""))}`, partial: false, scope: `${date(data.actualFrom)} – ${date(report.asOf)}`, Icon: Activity, tone: data.netFlow.startsWith("-") ? "text-[var(--ui-danger-text)]" : /[1-9]/.test(data.netFlow) ? "text-[var(--ui-success-text)]" : "", href: "/finance/movements" },
    { key: "outgoing" as const, value: `${/[1-9]/.test(data.outgoingTotal) ? "−" : ""}${amount(data.outgoingTotal)}`, partial: data.outgoingIncomplete || incomplete, scope: t("next30"), Icon: ArrowDownRight, tone: "text-[var(--ui-danger-text)]", href: "/finance/expected?filter=outgoing&period=30days" },
    { key: "overdue" as const, value: String(overdue.length), partial: false, scope: t("overdueScope", { incoming: overdue.filter(i => i.direction === "incoming").length, outgoing: overdue.filter(i => i.direction === "outgoing").length }), Icon: Clock3, tone: overdue.length ? "text-[var(--ui-warning-text)]" : "", href: "#overview-attention" },
  ];
  const attentionRows = (rows: typeof attention) => <ul className="divide-y divide-[var(--ui-border)]">{rows.map(row => <li key={row.key}><Link href={row.href} className={`group flex min-h-16 items-center justify-between gap-3 rounded-[var(--ui-radius-control)] py-3 ${interactive}`}><span className="min-w-0"><span className="block break-words text-sm font-medium">{row.title}</span><span className="mt-1 block text-xs text-[var(--ui-warning-text)]">{row.note}</span></span><ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text)]" /></Link></li>)}</ul>;

  return <div className="w-full min-w-0 space-y-5">
    <PageHeader title={t("title")} description={t("controlCenter", { currency: report.currency })} className="flex-wrap" action={<Link href={planningHref} className={textLink}>{t("fullForecast")}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>} />
    <section aria-label={t("currentState")} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(m => {
      const content = <><span className="flex w-full items-center justify-between gap-3 text-sm text-[var(--ui-text-secondary)]"><span className="flex items-center gap-2"><m.Icon aria-hidden="true" className="size-4 shrink-0" />{t(m.key)}</span>{m.key === "cash" ? <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none ${cashOpen ? "rotate-180" : ""}`} /> : <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />}</span><span className={`my-2 block break-words text-2xl font-semibold tracking-tight tabular-nums ${m.tone}`}>{m.value}{m.key !== "overdue" ? <span className="ml-2 text-xs font-normal tracking-normal text-[var(--ui-text-secondary)]">{report.currency}</span> : null}</span><span className="block text-xs text-[var(--ui-text-secondary)]">{m.scope}</span>{m.partial ? <span className="mt-2 block text-xs text-[var(--ui-warning-text)]">{t("knownSubtotal")}</span> : null}</>;
      const className = `flex min-w-0 flex-col items-start justify-start rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-left sm:p-5 ${interactive}`;
      return m.key === "cash" ? <button id="overview-cash-trigger" key={m.key} type="button" className={className} aria-expanded={cashOpen} aria-controls="overview-breakdown" onClick={() => setCashOpen(!cashOpen)}>{content}</button> : <Link key={m.key} href={m.href} className={className}>{content}</Link>;
    })}</section>
    {cashOpen ? <Panel id="overview-breakdown" className="p-4 sm:p-5"><h2 className="font-semibold">{ft("accounts")}</h2><dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map(a => <div key={a.id} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3"><dt className="text-sm text-[var(--ui-text-secondary)]">{a.name}</dt><dd className="mt-1 break-words font-medium tabular-nums">{amount(a.native, a.currency)}</dd>{a.currency !== report.currency ? <dd className="mt-1 break-words text-xs tabular-nums text-[var(--ui-text-secondary)]">{amount(a.amount, report.currency)}</dd> : null}</div>)}</dl><Link href="/finance/movements" className={`mt-2 ${textLink}`}>{t("allMovements")}<ArrowRight aria-hidden="true" className="size-4" /></Link></Panel> : null}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <Panel id="overview-attention" className="min-w-0 scroll-mt-5 p-4 sm:p-5 xl:col-start-2 xl:row-start-1">
        <div className="flex items-center gap-2"><span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${attention.length ? "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]" : "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]"}`}>{attention.length ? <Clock3 aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4" />}</span><h2 className="text-lg font-semibold">{t("attention", { count: attention.length })}</h2></div>
        <p className="mt-2 text-xs text-[var(--ui-text-secondary)]">{f(report.scenario)} · {date(report.asOf)} – {date(report.through)}</p>
        {attention.length ? <>{attentionRows(attention.slice(0, 3))}{attention.length > 3 ? <AnimatedDisclosure title={t("moreAttention", { count: attention.length - 3 })}>{attentionRows(attention.slice(3))}</AnimatedDisclosure> : null}</> : <p className="mt-4 text-sm text-[var(--ui-text-secondary)]">{t("allClear")}</p>}
      </Panel>
      <Panel className="min-w-0 space-y-3 p-4 sm:p-5 xl:col-start-1 xl:row-start-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{t("cashTrend")}</h2><span className="text-xs text-[var(--ui-text-secondary)]">{t("next30")} · {f(report.scenario)}</span></div>
        <FinanceCashChart data={data} currency={currency} through={data.upcomingThrough} compact />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-[var(--ui-border)] pt-2"><Link href={planningHref} className={textLink}>{t("fullForecast")}<ArrowRight aria-hidden="true" className="size-4" /></Link>{data.lowPoint.date <= data.upcomingThrough ? <p className={`text-xs tabular-nums ${data.lowPoint.amount.startsWith("-") ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]"}`}>{t("lowPoint")}: {amount(data.lowPoint.amount)} · {date(data.lowPoint.date)}{incomplete ? ` · ${t("incomplete")}` : ""}</p> : null}</div>
      </Panel>
    </div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)]">
      <Panel className="min-w-0 space-y-4 p-4 sm:p-5">
        <div><h2 className="text-lg font-semibold">{t("monthFlows")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${report.asOf}T00:00:00Z`))} · {report.currency} · {ft("movements.natures.operating")}</p></div>
        <div className="space-y-4">{(["incoming", "outgoing"] as const).map(direction => {
          const value = currentFlows.find(row => row.nature === "operating" && row.direction === direction)?.amount ?? "0";
          return <div key={direction} className="space-y-2"><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span>{ft(`planning.${direction === "incoming" ? "income" : "expenses"}`)}</span><span className={`font-semibold tabular-nums ${direction === "incoming" ? "text-[var(--ui-success-text)]" : "text-[var(--ui-danger-text)]"}`}>{amount(value)}</span></div>{flowsSafe ? <div aria-hidden="true" className="h-2 rounded-full bg-[var(--ui-surface-muted)]"><div className={`h-full rounded-full ${direction === "incoming" ? "bg-[var(--ui-success-accent)]" : "bg-[var(--ui-danger-border)]"}`} style={{ width: `${Math.abs(Number(value)) / flowMax * 100}%` }} /></div> : null}</div>;
        })}</div>
        {currentFlows.some(row => row.nature !== "operating") ? <dl className="space-y-2 border-t border-[var(--ui-border)] pt-3">{currentFlows.filter(row => row.nature !== "operating").map(row => <div key={`${row.nature}-${row.direction}`} className="flex flex-wrap justify-between gap-2 text-xs"><dt className="text-[var(--ui-text-secondary)]">{ft(`movements.natures.${row.nature}`)} · {ft(`movements.kinds.${row.direction}`)}</dt><dd className="tabular-nums">{amount(row.amount)}</dd></div>)}</dl> : null}
        <Link href="/finance/movements" className={textLink}>{t("allMovements")}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </Panel>
      <Panel className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{t("upcoming")}</h2><span className="text-xs text-[var(--ui-text-secondary)]">{date(report.asOf)} – {date(data.upcomingThrough)} · {f(report.scenario)}</span></div>
        <ul className="mt-3 divide-y divide-[var(--ui-border)]">{upcoming.slice(0, 5).map(i => <li key={i.id}><Link href={itemHref(i.id)} className={`grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[var(--ui-radius-control)] py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] ${interactive}`}><span className="col-span-2 text-xs text-[var(--ui-text-secondary)] sm:col-span-1">{date(i.date ?? report.asOf)}</span><span className="min-w-0"><span className="block break-words text-sm font-medium">{i.description || category(i.categoryId, null)}</span><span className="mt-1 block text-xs text-[var(--ui-text-secondary)]">{category(i.categoryId, null)}{i.nature !== "operating" ? ` · ${ft(`movements.natures.${i.nature}`)}` : ""}{i.certainty === "estimated" ? ` · ${ft("planning.states.estimated")}` : ""}{i.dueDate && i.dueDate < report.asOf ? <span className="ml-2 text-[var(--ui-warning-text)]">{t("overdue")} · {date(i.dueDate)}</span> : null}</span></span><span className={`text-right text-sm font-semibold tabular-nums ${i.direction === "incoming" ? "text-[var(--ui-success-text)]" : "text-[var(--ui-danger-text)]"}`}><span className="sr-only">{ft(`movements.kinds.${i.direction}`)} </span>{i.direction === "incoming" ? "+" : "−"}{amount(i.reportingAmount)}<span className="mt-1 block text-xs font-normal text-[var(--ui-text-secondary)]">{i.currency === report.currency ? report.currency : amount(i.amount, i.currency)}</span></span></Link></li>)}</ul>
        {!upcoming.length ? <p className="py-6 text-sm text-[var(--ui-text-secondary)]">{t("emptyUpcoming")}</p> : null}
        <Link href="/finance/expected" className={`mt-2 ${textLink}`}>{t("allExpected")}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </Panel>
    </div>
    {budgetSignals.length ? <Panel className="min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-semibold">{t("budgetSignal")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("variance")} · {date(report.from)} – {date(report.through)} · {report.currency}</p></div><Link href={`${planningHref}&detail=comparison#planning-comparison`} className={textLink}>{t("budgetDetails")}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></div><dl className="mt-3 grid gap-3 md:grid-cols-3">{budgetSignals.map((row, i) => <div key={i} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3"><dt className="text-sm">{category(row.id, row.name)}<span className="mt-1 block text-xs text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${row.direction}`)} · {ft(`movements.natures.${row.nature}`)}</span></dt><dd className="mt-2 break-words font-semibold tabular-nums">{row.variance?.startsWith("-") ? "" : "+"}{amount(row.variance)}{row.incomplete ? <span className="mt-1 block text-xs font-normal text-[var(--ui-warning-text)]">{t("knownSubtotal")}</span> : null}</dd></div>)}</dl></Panel> : null}
  </div>;
}
