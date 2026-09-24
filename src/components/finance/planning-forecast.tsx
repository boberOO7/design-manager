"use client";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceOverview } from "@/lib/finance-overview";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { Panel } from "@/components/ui/panel";
import { FinanceCashChart } from "./cash-chart";

export function PlanningForecast({ data, currency }: { data: FinanceOverview; currency: FinanceCurrency }) {
  const t = useTranslations("Finance.forecast"), o = useTranslations("Finance.overview");
  const locale = useLocale();
  const report = data.forecast;
  const amount = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale, "decimal");
  const metrics = [
    { label: o("cash"), value: report.cashBase, date: report.asOf, Icon: Wallet },
    { label: t("horizonCash"), value: report.months.at(-1)?.closing ?? null, date: report.through, Icon: ArrowUpRight },
    { label: o("lowPoint"), value: data.lowPoint.amount, date: data.lowPoint.date, Icon: ArrowDownRight },
  ];
  return <Panel className="min-w-0 overflow-hidden">
    <dl className="grid divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">{metrics.map(({ label, value, date, Icon }) => <div key={label} className="min-w-0 p-4 sm:p-5">
      <dt className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><Icon aria-hidden="true" className="size-4 shrink-0" />{label}</dt>
      <dd className={`mt-2 break-words text-2xl font-semibold tabular-nums ${value?.startsWith("-") ? "text-[var(--ui-danger-text)]" : ""}`}>{amount(value)} <span className="text-xs font-normal text-[var(--ui-text-secondary)]">{currency.code}</span></dd>
      <dd className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date}</dd>
    </div>)}</dl>
    <section aria-labelledby="forecast-chart-heading" className="space-y-4 border-t border-[var(--ui-border)] p-4 sm:p-5">
      <h2 id="forecast-chart-heading" className="text-lg font-semibold">{o("cashChart")}</h2>
      <FinanceCashChart data={data} currency={currency} />
      <details className="text-sm text-[var(--ui-text-secondary)]"><summary className="cursor-pointer">{o("valuation")}</summary><p className="mt-2 max-w-3xl">{o("valuationHelp")}</p></details>
    </section>
  </Panel>;
}
