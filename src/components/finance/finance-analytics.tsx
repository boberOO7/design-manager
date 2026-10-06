"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceAnalytics } from "@/lib/finance-analytics";
import { canChartFinanceAmount, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { FinancePerformanceChart } from "./performance-chart";
import { formatDateOnly } from "@/lib/utils";

export const overviewLink = "inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] text-sm underline decoration-[var(--ui-border-strong)] underline-offset-4 transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none";
export function FinanceAnalyticsSection({ data, currency }: { data: FinanceAnalytics; currency: FinanceCurrency }) {
  const t = useTranslations("Finance.overview.analytics"), locale = useLocale();
  const [worst, setWorst] = useState(false);
  const money = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale, "decimal");
  const reportHref = `/finance/reports?from=${data.from}&to=${data.to}`;
  const projectHref = `${reportHref}&report=projects`;
  const ranked = (worst ? [...data.completeProjects].reverse() : data.completeProjects).slice(0, 5);
  const maxExpense = Math.max(1, ...data.expenses.map(row => Math.abs(Number(row.amount ?? "0"))));
  const barsSafe = data.expenses.every(row => row.amount === null || canChartFinanceAmount(row.amount, currency.minor_units));
  const projectRow = (row: FinanceAnalytics["completeProjects"][number], incomplete = false) => <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-[var(--ui-border-subtle)] py-3 sm:grid-cols-[minmax(0,1fr)_10rem_7rem]">
    <Link href={`${projectHref}&project=${row.id}`} className={`${overviewLink} min-w-0 break-words font-medium`}>{row.name}</Link>
    <div className="text-right tabular-nums"><span className="mr-2 text-xs text-[var(--ui-text-muted)] sm:sr-only">{t("result")}</span><span className={row.result.amount?.startsWith("-") && !incomplete ? "text-[var(--ui-danger-text)]" : ""}>{money(row.result.amount)}</span><span className="ml-1 text-xs text-[var(--ui-text-muted)] sm:sr-only">{currency.code}</span>{incomplete ? <span className="mt-1 block text-xs text-[var(--ui-warning-text)]">{t("needsData")}</span> : null}</div>
    <span className="col-start-2 text-right text-sm tabular-nums text-[var(--ui-text-secondary)] sm:col-start-auto"><span className="mr-2 text-xs text-[var(--ui-text-muted)] sm:sr-only">{t("margin")}</span>{row.margin === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(row.margin))}%`}</span>
  </li>;
  return <div className="space-y-8" data-testid="finance-analytics">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[var(--ui-text-secondary)]"><p>{t("recognizedBasis")} · {formatDateOnly(data.from, locale)} – {formatDateOnly(data.to, locale)}</p><Link href={reportHref} className={overviewLink}>{t("report")}</Link></div>
    {data.start && data.from < data.start ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("startsOn", { date: formatDateOnly(data.start, locale) })}</p> : null}
    <section aria-label={t("headline")} className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      {(["result", "revenue", "costs"] as const).map((key, i) => <div key={key} className={i === 0 ? "col-span-2 min-w-0 sm:col-span-1" : "min-w-0"}>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t(key)}</p><p className={`mt-2 break-words font-semibold tracking-tight tabular-nums ${i === 0 ? "text-3xl sm:text-4xl" : "text-2xl"} ${key === "result" && data[key].amount?.startsWith("-") ? "text-[var(--ui-danger-text)]" : ""}`}>{money(data[key].amount)} <span className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{currency.code}</span></p>
        {data[key].incomplete && data.available ? <Link href={reportHref} className={`${overviewLink} mt-1 text-xs text-[var(--ui-warning-text)]`}>{t("partial")}</Link> : null}
      </div>)}
    </section>
    {!data.available ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("activationNeeded")} <Link href="/finance/reports" className={overviewLink}>{t("report")}</Link></p> : <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,2.2fr)_minmax(15rem,1fr)]">
      <section className="min-w-0" aria-labelledby="finance-performance-heading"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="finance-performance-heading" className="text-lg font-semibold">{t("trend")}</h2><span className="text-xs text-[var(--ui-text-muted)]">{t("currentMonth")}</span></div><FinancePerformanceChart months={data.months} currency={currency}/></section>
      <section className="min-w-0" aria-labelledby="finance-expenses-heading"><h2 id="finance-expenses-heading" className="mb-5 text-lg font-semibold">{t("expenseStructure")}</h2><ul className="space-y-5">{data.expenses.map(row => <li key={row.key}><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="text-[var(--ui-text-secondary)]">{t(row.key)}</span><span className="font-medium tabular-nums">{money(row.amount)}</span></div>{barsSafe && row.amount !== null ? <div aria-hidden="true" className="mt-2 h-1.5 rounded-full bg-[var(--ui-surface-muted)]"><div className={`h-full rounded-full ${row.amount.startsWith("-") ? "bg-[var(--ui-danger-border)]" : "bg-[var(--ui-text-muted)]"}`} style={{ width: `${Math.abs(Number(row.amount)) / maxExpense * 100}%` }}/></div> : null}{row.incomplete ? <Link href={`${reportHref}${row.key === "labor" ? "#labor" : ""}`} className={`${overviewLink} text-xs text-[var(--ui-warning-text)]`}>{t("partial")}</Link> : null}</li>)}</ul><p className="mt-4 text-xs text-[var(--ui-text-muted)]">{currency.code}</p></section>
    </div>}
    {data.available ? <section aria-labelledby="finance-projects-heading" className="border-t border-[var(--ui-border-subtle)] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="finance-projects-heading" className="text-lg font-semibold">{t("projects")}</h2><Link href={projectHref} className={overviewLink}>{t("allProjects")}</Link></div>
      <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("projectBasis")}</p>
      {data.completeProjects.length ? <><div className="my-3 inline-flex gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{[false, true].map(value => <button key={String(value)} type="button" aria-pressed={worst === value} onClick={() => setWorst(value)} className={`min-h-11 rounded-[var(--ui-radius-control)] px-3 text-sm transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none ${worst === value ? "bg-[var(--ui-surface)] font-medium text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)]"}`}>{t(value ? "lowest" : "highest")}</button>)}</div><div className="hidden grid-cols-[minmax(0,1fr)_10rem_7rem] gap-x-4 text-right text-xs text-[var(--ui-text-muted)] sm:grid"><span/><span>{t("result")} · {currency.code}</span><span>{t("margin")}</span></div><ul>{ranked.map(row => projectRow(row))}</ul></> : <p className="py-4 text-sm text-[var(--ui-text-secondary)]">{t(data.incompleteProjects.length ? "emptyRanking" : "noProjects")}</p>}
      {data.incompleteProjects.length ? <div className="mt-4"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("needsDataCount", { count: data.incompleteProjects.length })}</p><div className="mt-3 hidden grid-cols-[minmax(0,1fr)_10rem_7rem] gap-x-4 text-right text-xs text-[var(--ui-text-muted)] sm:grid"><span/><span>{t("result")} · {currency.code}</span><span>{t("margin")}</span></div><ul>{data.incompleteProjects.slice(0, 5).map(row => projectRow(row, true))}</ul>{data.incompleteProjects.length > 5 ? <Link href={projectHref} className={overviewLink}>{t("allProjects")}</Link> : null}</div> : null}
      {data.unallocatedLabor ? <p className="mt-3 text-xs text-[var(--ui-text-secondary)]">{t("unallocatedLabor")} <Link href={`${reportHref}#labor`} className={overviewLink}>{t("report")}</Link></p> : null}
    </section> : null}
  </div>;
}
