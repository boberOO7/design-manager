"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { canChartFinanceAmount, formatFinanceAmount, formatFinanceDecimal, type FinanceCurrency } from "@/lib/finance";
import type { OverviewProjectEconomics } from "@/lib/finance-overview-economics";
import { StatisticsMotion } from "@/components/statistics/statistics-motion";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Panel } from "@/components/ui/panel";
import { OverviewDetail } from "./overview-detail";
import { cashOutColor } from "./overview-cash-chart";
import { formatDateOnly } from "@/lib/utils";

type EconomicsData = OverviewProjectEconomics & { currency: FinanceCurrency; asOf: string };
const projectHref = (id: string) => `/projects/${id}?view=finance&financeTab=result`;
const link = "rounded transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none";

export function OverviewProjectEconomics({ data }: { data: EconomicsData }) {
  const t = useTranslations("Finance.overview.economics"), historical = useTranslations("Finance.historicalLabor"), locale = useLocale();
  const money = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, data.currency, locale, "decimal");
  const percent = (value: string | null) => value === null ? "—" : `${formatFinanceDecimal(value, locale, { maximumFractionDigits: 1 })}%`;
  const points = data.projects.slice(0, 5);
  const [selected, setSelected] = useState<string | null>(null);
  const active = points.find(project => project.id === selected);
  const series = (project: typeof points[number]) => [
    { key: "contract", value: project.contract, color: "var(--ui-info-accent)" },
    { key: "knownCosts", value: project.knownCosts ?? "0", color: cashOutColor },
  ];
  const costDetails = (project: typeof points[number]) => [
    ...(project.costs !== null ? [{ key: "costs", value: project.costs }] : []),
    ...(project.recordedCount ? [{ key: "recordedCosts", value: project.recordedCosts }] : []),
    ...(project.provisionalCosts !== null || project.provisionalIncomplete ? [{ key: "provisionalCosts", value: project.provisionalCosts }] : []),
    ...(project.historicalCosts !== null || project.historicalIncomplete ? [{ key: "historicalCosts", value: project.historicalCosts }] : []),
    ...(project.pendingExpenseCosts !== null || project.pendingExpenseIncomplete ? [{ key: "pendingExpenseCosts", value: project.pendingExpenseCosts }] : []),
  ];
  const safe = points.every(project => series(project).map(item => item.value).every(value => value === null || canChartFinanceAmount(value, data.currency.minor_units)));
  const values = points.flatMap(project => series(project).flatMap(item => item.value === null ? [] : [Number(item.value)]));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const metrics = [
    { key: "averageContract", value: money(data.averageContract), unit: data.currency.code, count: data.counts.priced },
    { key: "averageMargin", value: percent(data.averageMargin), unit: null, count: data.counts.costed },
    { key: "contractPerArea", value: money(data.contractPerArea), unit: `${data.currency.code}/${t("squareMetre")}`, count: data.counts.withArea },
    { key: "contributionPerArea", value: money(data.contributionPerArea), unit: `${data.currency.code}/${t("squareMetre")}`, count: data.counts.costedWithArea },
  ];
  const highlights = ["mostExpensive",
    ...(data.highlights.leastExpensive?.id !== data.highlights.mostExpensive?.id ? ["leastExpensive"] as const : []),
    ...(data.highlights.highestMargin ? ["highestMargin"] as const : []),
    ...(data.highlights.lowestMargin && data.highlights.lowestMargin.id !== data.highlights.highestMargin?.id ? ["lowestMargin"] as const : []),
  ] as const;
  const summary = (project: typeof points[number]) => `${project.name} · ${series(project).map(item => `${t(item.key)}: ${money(item.value)}`).join(" · ")} · ${t("margin")}: ${percent(project.margin)}${project.costsIncomplete ? ` · ${t("incompleteShort")}` : ""}`;
  return <section aria-labelledby="overview-economics-heading" data-testid="overview-economics" className="min-w-0">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h2 id="overview-economics-heading" className="text-lg font-semibold">{t("title")}</h2><OverviewDetail info title={t("title")}><div className="space-y-2 text-xs leading-5 text-[var(--ui-text-secondary)]"><p>{t("basisHelp")}</p><p>{t("costHelp")}</p><p>{t("fxHelp", { date: formatDateOnly(data.asOf, locale) })}</p></div></OverviewDetail></div><p className="text-xs text-[var(--ui-text-muted)]">{t("scope")}</p></div>
    <StatisticsMotion section="overview" period="all">
      <Panel data-statistics-reveal="0" className="min-w-0">
        <dl className="grid grid-cols-2 divide-x divide-[var(--ui-border)] border-b border-[var(--ui-border)] lg:grid-cols-4">{metrics.map(metric => <div key={metric.key} className="min-w-0 p-4 odd:border-b even:border-b lg:border-b-0 xl:p-5 border-[var(--ui-border)]">
          <dt className="flex min-h-9 items-center justify-between gap-1 text-xs font-medium text-[var(--ui-text-secondary)]"><span>{t(metric.key)}</span><OverviewDetail info title={t(metric.key)}><p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t(`${metric.key}Help`)}</p><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("sample", { count: metric.count })}</p></OverviewDetail></dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-semibold tracking-tight tabular-nums"><span className="break-all text-2xl">{metric.value}</span>{metric.unit ? <span className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{metric.unit}</span> : null}</dd>
          <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("sample", { count: metric.count })}</p>
        </div>)}</dl>
        {points.length ? <div className="grid min-w-0 xl:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
          <div className="min-w-0 p-5" data-testid="economics-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("comparison")}</h3><span className="text-xs text-[var(--ui-text-muted)]">{t("topFive")}</span></div>
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--ui-text-secondary)]">{(["contract", "knownCosts"] as const).map(label => <span key={label} className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: label === "contract" ? "var(--ui-info-accent)" : cashOutColor }}/>{t(label)}</span>)}<span className="ml-auto text-[var(--ui-text-muted)]">{data.currency.code}</span></div>
            <p className="mb-4 text-xs leading-5 text-[var(--ui-text-muted)]">{t("knownCostHelp")}</p>
            <div className="relative" onMouseLeave={() => setSelected(null)}>
              <ol className="space-y-3">{points.map(project => <li key={project.id} className={`rounded-[var(--ui-radius-control)] px-2 py-1.5 transition-colors duration-[180ms] motion-reduce:transition-none ${selected === project.id ? "bg-[var(--ui-surface-muted)]" : "hover:bg-[var(--ui-surface-subtle)]"}`}>
                <div className="mb-1 flex items-center justify-between gap-3"><Link href={projectHref(project.id)} title={project.name} className={`${link} inline-flex min-w-0 items-center gap-1 text-xs font-medium text-[var(--ui-text-secondary)]`}><span className="truncate">{project.name}</span><ArrowUpRight aria-hidden="true" className="size-3 shrink-0"/></Link><span className="shrink-0 text-xs tabular-nums text-[var(--ui-text-muted)]">{project.costsIncomplete ? t("incompleteShort") : percent(project.margin)}</span></div>
                <button type="button" data-economics-point={project.id} aria-label={summary(project)} className="block min-h-10 w-full rounded text-left focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]" onMouseEnter={() => setSelected(project.id)} onFocus={() => setSelected(project.id)} onBlur={() => setSelected(null)} onClick={() => setSelected(project.id)} onKeyDown={event => { if (event.key === "Escape") setSelected(null); }}>
                  {series(project).map(({ key, value, color }) => <span key={key} data-cost-kind={key} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 py-1">
                    <span className="min-w-0"><span className="mb-1 block text-[10px] text-[var(--ui-text-muted)]">{t(key)}</span><span aria-hidden="true" className={`relative block h-2.5 rounded-sm ${value === null ? "border border-dashed border-[var(--ui-border-strong)]" : "bg-[var(--ui-surface-muted)]"}`}>{safe && value !== null ? <span data-statistics-progress className="absolute inset-y-0 block rounded-sm" style={{ color, background: color, left: `${(Math.min(0, Number(value)) - min) / (max - min) * 100}%`, width: `${Math.abs(Number(value)) / (max - min) * 100}%` }}/> : null}</span></span>
                    <span className="text-right text-xs font-medium tabular-nums" style={{ color: value === null ? "var(--ui-text-muted)" : undefined }}>{money(value)}</span>
                  </span>)}
                </button>
                {project.historicalIssues.includes("missing_capacity") ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{historical("issue.missing_capacity")}. <Link href="/finance/reports#labor" className={`${link} underline underline-offset-2`}>{t("configureLabor")}</Link></p> : null}
              </li>)}</ol>
              {safe ? <div aria-hidden="true" className="mt-3 mr-[7.75rem] flex justify-between px-2 text-[10px] tabular-nums text-[var(--ui-text-muted)]">{[min, (min + max) / 2, max].map((value, index) => <span key={index}>{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</span>)}</div> : null}
              {active ? <div data-testid="economics-tooltip" aria-hidden="true" className="pointer-events-none absolute right-0 top-0 z-10 w-72 max-w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-xs shadow-[var(--ui-shadow-popover)]">
                <p className="mb-2 font-medium">{active.name}</p><dl className="space-y-2">{([...series(active).map(item => [item.key, money(item.value)]), ...costDetails(active).map(item => [item.key, money(item.value)]), ["contribution", money(active.contribution)], ["margin", percent(active.margin)]]).map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3"><dt className="text-[var(--ui-text-secondary)]">{t(label)}</dt><dd className="tabular-nums">{value}{label !== "margin" ? ` ${data.currency.code}` : ""}</dd></div>)}</dl>
                {active.costsIncomplete ? <p className="mt-3 leading-5 text-[var(--ui-text-muted)]">{active.reasons.map(reason => t(`reasons.${reason}`)).join(" · ")}</p> : null}
              </div> : null}
              <p className="sr-only" aria-live="polite">{active ? summary(active) : ""}</p>
            </div>
          </div>
          <div className="self-start border-t border-[var(--ui-border)] p-4 xl:border-t-0 xl:border-l xl:p-5" data-testid="economics-highlights">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              {highlights.map(key => {
                const project = data.highlights[key], isMargin = key === "highestMargin" || key === "lowestMargin";
                return <div key={key} className="min-w-0"><h3 className="text-xs leading-5 text-[var(--ui-text-muted)]">{t(key)}</h3>{project ? <>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1 font-semibold tabular-nums"><span className="break-all text-lg" style={{ color: isMargin ? project.contribution?.startsWith("-") ? cashOutColor : "var(--ui-success-text)" : undefined }}>{isMargin ? percent(project.margin) : money(project.contract)}</span>{!isMargin ? <span className="text-xs font-normal text-[var(--ui-text-muted)]">{data.currency.code}</span> : null}</p>
                  <Link href={projectHref(project.id)} className={`${link} mt-1 inline-flex max-w-full items-start gap-1 text-xs leading-5 text-[var(--ui-text-secondary)]`} title={project.name}><span className="min-w-0 break-words">{project.name}</span><ArrowUpRight aria-hidden="true" className="mt-1 size-3 shrink-0"/></Link>
                  {!project.completed ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("provisionalShort")}</p> : null}
                </> : <p className="mt-2 text-xs text-[var(--ui-text-muted)]">—</p>}</div>;
              })}
              {!data.highlights.highestMargin && !data.highlights.lowestMargin ? <p className="col-span-2 flex items-start gap-2 border-t border-[var(--ui-border-subtle)] pt-3 text-xs leading-5 text-[var(--ui-text-muted)]"><CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0"/>{t("marginsUnavailable")}</p> : null}
            </div>
          </div>
        </div> : <p className="flex items-center gap-2 px-5 py-6 text-sm text-[var(--ui-text-secondary)]"><CircleHelp className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true"/>{t("empty")}</p>}
        <div className="border-t border-[var(--ui-border)] px-5 py-1"><AnimatedDisclosure title={t("coverage", { known: data.projects.filter(project => project.knownCosts !== null).length, costed: data.counts.costed })} className="[&>button]:text-xs"><div className="space-y-3 pb-4 text-xs leading-5 text-[var(--ui-text-secondary)]">
          <p>{t("coverageHelp", { recognized: data.coverage.recognized, recorded: data.coverage.recorded, provisional: data.coverage.provisional })}</p>
          <p>{t("costHelp")}</p><p>{t("directExpenseHelp")}</p><p>{t("fxHelp", { date: formatDateOnly(data.asOf, locale) })}</p>
          {data.coverage.reasons.length ? <div><p className="font-medium">{t("unavailableReasons")}</p><ul className="mt-1 list-disc space-y-1 pl-4">{data.coverage.reasons.map(reason => <li key={reason}>{t(`reasons.${reason}`)}</li>)}</ul></div> : null}
          {data.projects.length ? <div className="max-h-80 overflow-auto"><table className="w-full text-left [&_th]:p-2 [&_td]:p-2"><caption className="sr-only">{t("title")}</caption><thead><tr><th>{t("project")}</th><th>{t("costs")}</th><th>{t("recordedCosts")}</th><th>{t("provisionalCosts")}</th><th>{t("historicalCosts")}</th><th>{t("pendingExpenseCosts")}</th><th>{t("margin")}</th></tr></thead><tbody>{data.projects.map(project => <tr key={project.id} className="border-t border-[var(--ui-border)]"><th className="min-w-40 font-normal"><Link href={projectHref(project.id)} className={link}>{project.name}</Link>{project.reasons.length ? <p className="mt-1 text-[var(--ui-text-muted)]">{project.reasons.map(reason => t(`reasons.${reason}`)).join(" · ")}</p> : null}{project.historicalIssues.length ? <p className="mt-1 text-[var(--ui-text-muted)]">{project.historicalIssues.map(issue => historical.has(`issue.${issue}`) ? historical(`issue.${issue}`) : historical("missingInput")).join(" · ")}</p> : null}</th><td className="tabular-nums">{money(project.costs)}{project.missingRecognizedFx ? <span className="block">{t("partialValuation")}</span> : null}</td><td className="tabular-nums">{money(project.recordedCosts)}{project.missingRecordedFx ? <span className="block">{t("partialValuation")}</span> : null}</td><td className="tabular-nums">{money(project.provisionalCosts)}{project.provisionalIncomplete ? <span className="block">{t("partialLabor")}</span> : null}</td><td className="tabular-nums">{money(project.historicalCosts)}{project.historicalIncomplete ? <span className="block">{t("partialLabor")}</span> : null}</td><td className="tabular-nums">{money(project.pendingExpenseCosts)}{project.missingPendingExpenseFx ? <span className="block">{t("partialValuation")}</span> : null}</td><td className="tabular-nums">{percent(project.margin)}</td></tr>)}</tbody></table></div> : null}
        </div></AnimatedDisclosure></div>
      </Panel>
    </StatisticsMotion>
  </section>;
}
