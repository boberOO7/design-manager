"use client";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceOverview } from "@/lib/finance-overview";
import type { getFinanceData } from "@/data/queries/finance";
import { canChartFinanceAmount, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { Panel } from "@/components/ui/panel";
import { FinanceCashChart } from "./cash-chart";

export function PlanningForecast({ data, currency, categories, onOpenComparison }: {
  data: FinanceOverview; currency: FinanceCurrency; onOpenComparison: () => void;
  categories: NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["categories"];
}) {
  const t = useTranslations("Finance.forecast"), o = useTranslations("Finance.overview"), ft = useTranslations("Finance");
  const locale = useLocale();
  const report = data.forecast;
  const incomplete = report.cashIncomplete || report.issues.length > 0;
  const amount = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale, "decimal");
  const metrics = [
    { label: o("cash"), value: report.cashBase, date: report.asOf, partial: report.cashIncomplete, Icon: Wallet },
    { label: t("horizonCash"), value: report.months.at(-1)?.closing ?? null, date: report.through, partial: incomplete, Icon: ArrowUpRight },
    { label: o("lowPoint"), value: data.lowPoint.amount, date: data.lowPoint.date, partial: incomplete, Icon: ArrowDownRight },
  ];
  const flowsSafe = data.flows.every(row => canChartFinanceAmount(row.amount, currency.minor_units));
  const flowMax = Math.max(1, ...data.flows.map(row => Math.abs(Number(row.amount))));
  const table = "w-full text-left text-sm [&_th]:p-3 [&_th]:font-medium [&_td]:p-3 [&_td]:text-right [&_td]:tabular-nums [&_td]:whitespace-nowrap [&_tr]:border-b [&_tr]:border-[var(--ui-border)]";
  return <>
    <Panel className="min-w-0 overflow-hidden">
      <dl className="grid divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">{metrics.map(({ label, value, date, partial, Icon }) => <div key={label} className="min-w-0 p-4 sm:p-5">
        <dt className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><Icon aria-hidden="true" className="size-4 shrink-0" />{label}</dt>
        <dd className={`mt-2 break-words text-2xl font-semibold tabular-nums ${value?.startsWith("-") ? "text-[var(--ui-danger-text)]" : ""}`}>{amount(value)} <span className="text-xs font-normal text-[var(--ui-text-secondary)]">{currency.code}</span></dd>
        <dd className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date}{partial ? <span className="mt-1 block">{o("knownSubtotal")}</span> : null}</dd>
      </div>)}</dl>
      <section aria-labelledby="forecast-chart-heading" className="space-y-4 border-t border-[var(--ui-border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="forecast-chart-heading" className="text-lg font-semibold">{o("cashChart")}</h2><span className="text-sm text-[var(--ui-text-secondary)]">{t(report.scenario)}</span></div>
        <FinanceCashChart data={data} currency={currency} />
        <details className="text-sm text-[var(--ui-text-secondary)]"><summary className="cursor-pointer">{o("valuation")}</summary><p className="mt-2 max-w-3xl">{o("valuationHelp")}</p></details>
      </section>
    </Panel>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Panel className="min-w-0 space-y-4 p-4 sm:p-5">
        <div><h2 className="text-lg font-semibold">{o("flows")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{o("actual")} · {data.actualFrom} – {report.asOf} · {currency.code}</p></div>
        {!flowsSafe ? <p className="text-sm">{o("chartScale")}</p> : null}
        {!data.flows.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{o("emptyFlows")}</p> : null}
        {[...new Set(data.flows.map(row => row.month))].map(month => <div key={month} className="space-y-3">
          <h3 className="text-sm font-medium">{new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</h3>
          {data.flows.filter(row => row.month === month).map(row => <div key={`${row.nature}:${row.direction}`} className="space-y-1">
            <div className="flex flex-wrap justify-between gap-x-3 text-xs"><span>{ft(`movements.kinds.${row.direction}`)} · {ft(`movements.natures.${row.nature}`)}</span><span className="tabular-nums">{amount(row.amount)}</span></div>
            {flowsSafe ? <div aria-hidden="true" className="h-1.5 rounded-full bg-[var(--ui-surface-muted)]"><div className={`h-full rounded-full ${row.nature !== "operating" ? "bg-[var(--ui-text-muted)]" : row.direction === "incoming" ? "bg-[var(--ui-success-accent)]" : "bg-[var(--ui-danger-text)]"}`} style={{ width: `${Math.abs(Number(row.amount)) / flowMax * 100}%` }} /></div> : null}
          </div>)}
        </div>)}
      </Panel>
      <Panel className="min-w-0 space-y-3 p-4 sm:p-5">
        <div><h2 className="text-lg font-semibold">{o("budgetComparison")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{report.from} – {report.through} · {currency.code}{incomplete ? ` · ${o("knownSubtotal")}` : ""}</p></div>
        <div className="overflow-x-auto"><table className={`${table} min-w-[36rem]`}><caption className="sr-only">{o("budgetComparison")}</caption><thead><tr><th scope="col">{t("category")}</th>{["budget", "full", "actual"].map(key => <th key={key} scope="col" className="text-right">{t(key)}</th>)}<th scope="col" className="text-right">{o("variance")}</th></tr></thead>
          <tbody>{data.categories.slice(0, 5).map((row, i) => <tr key={i}><th scope="row" className="min-w-36">{financeCategoryLabel(categories.find(c => c.id === row.id), row.name, key => ft(`planning.defaults.${key}`)) || t("unclassified")}<span className="mt-1 block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${row.direction}`)} · {ft(`movements.natures.${row.nature}`)}</span></th><td>{amount(row.budget)}</td><td>{amount(row.forecast)}{row.incomplete ? " *" : ""}</td><td>{amount(row.actual)}</td><td>{amount(row.variance)}{row.incomplete ? " *" : ""}</td></tr>)}</tbody>
        </table></div>
        {!data.categories.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{o("emptyBudget")}</p> : null}
        <p className="text-xs text-[var(--ui-text-secondary)]">{t("varianceOrder")}</p>
        <a href="#planning-comparison" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" onClick={onOpenComparison}>{o("budgetDetails")}</a>
      </Panel>
    </div>
  </>;
}
