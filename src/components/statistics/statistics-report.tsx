import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatisticsChart } from "@/components/statistics/statistics-chart";
import { statisticsPeriods, statisticsSections, type StatisticsSection } from "@/lib/statistics";
import type { StatisticsPageReport } from "@/data/queries/statistics";
import { StatisticsInfo } from "./statistics-info";
import { LeadsStatistics, TeamStatistics, CalendarStatistics } from "./statistics-sections";
import { canChartFinanceAmount, formatFinanceDecimal } from "@/lib/finance";

const panel = "min-w-0 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]";

export async function StatisticsReportView({ report, section }: { report: StatisticsPageReport; section: StatisticsSection }) {
  const [t, locale] = await Promise.all([getTranslations("Statistics"), getLocale()]);
  const number = (value: number | null, digits = 0) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const area = (value: number | null) => value === null ? "—" : `${number(value, 1)} ${t("squareMetres")}`;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  const money = (value: string, currency: string) => formatFinanceDecimal(value, locale, { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 });
  const coverage = (from: string | null) => from ? t("recordsFrom", { date: date(from) }) : t("noRecordedHistory");
  const currentMonth = `${report.today.slice(0, 7)}-01`;
  const points = (key: "physicalArea" | "completedProjects" | "creditedArea" | "completedTasks" | "durationMedian", formatter: (value: number | null) => string) => report.months.map(month => ({
    month: month.month, value: month[key], display: month[key] === null ? t("unavailable") : formatter(month[key]), detail: month.month === currentMonth ? t("partialMonth") : undefined,
  }));
  const fastest = report.durations[0], longest = report.durations.at(-1);
  const currencies = [...new Set(report.payroll.map(row => row.currency))];
  const hasRatio = report.payroll.some(row => row.costPerCreditedM2 !== null);

  return <div className="w-full min-w-0 space-y-5" data-testid="statistics-report">
    <PageHeader title={t("title")} description={t("description")} className="flex-col items-start gap-3 xl:flex-row xl:items-center" action={
      <nav aria-label={t("period")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-1">
        {statisticsPeriods.map(period => <Link key={period} href={`/statistics?period=${period}&section=${section}`} scroll={false} aria-current={report.period === period ? "page" : undefined}
          className={`rounded-[calc(var(--ui-radius-control)-2px)] px-3 py-2 text-xs font-medium transition-colors duration-[180ms] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] ${report.period === period ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)]"}`}>{t(`period${period}`)}</Link>)}
      </nav>} />
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-[var(--ui-text-muted)]">
      <div className="flex items-center gap-3"><CalendarDays className="size-4 shrink-0" aria-hidden="true" /><div><p className="text-sm font-medium tabular-nums text-[var(--ui-text)]">{date(report.from)} — {date(report.through)}</p><p className="mt-0.5">{t("partialMonth")}</p></div></div>
      <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-[var(--ui-radius-control)] py-1 hover:text-[var(--ui-text)]">{t("activeNow", { count: report.totals.activeProjects })}<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
    </div>

    <nav aria-label={t("sections")} className="grid w-full grid-cols-4 gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1 sm:flex sm:w-fit">
      {statisticsSections.map(item => <Link key={item} href={`/statistics?period=${report.period}&section=${item}`} scroll={false} aria-current={section === item ? "page" : undefined} className="flex min-h-11 items-center justify-center rounded-[var(--ui-radius-control)] px-2 text-xs font-medium sm:px-4 sm:text-sm text-[var(--ui-text-secondary)] transition-colors duration-[180ms] hover:bg-[var(--ui-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)]">{t(`section_${item}`)}</Link>)}
    </nav>
    {section === "leads" ? <LeadsStatistics report={report.leads} /> : section === "team" ? <TeamStatistics report={report.attendance} today={report.today} /> : section === "calendar" ? <CalendarStatistics report={report.calendar} /> : <>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section id="stats-production" aria-labelledby="stats-production-title" className={panel}>
        <div className="border-b border-[var(--ui-border)] px-5 py-4"><h2 id="stats-production-title" className="flex items-center justify-between text-base font-semibold text-[var(--ui-text)]">{t("productionTitle")}<StatisticsInfo label={t("physicalArea")}><p>{t("physicalDefinition")}</p><p>{t("projectHistoryNote")}</p><p>{coverage(report.coverage.completionFrom)}</p></StatisticsInfo></h2></div>
        <div className="grid grid-cols-2 divide-x divide-[var(--ui-border)] border-b border-[var(--ui-border)] [&>div>p:first-child]:min-h-10 sm:[&>div>p:first-child]:min-h-5">
          <Headline label={t("completedProjects")} value={number(report.totals.completedProjects)} />
          <Headline label={t("physicalArea")} value={number(report.totals.physicalArea, 1)} unit={t("squareMetres")} />
        </div>
        <div className="space-y-4 p-5">
          <StatisticsChart title={t("physicalArea")} unit={t("squareMetres")} points={points("physicalArea", area)} color="var(--ui-success-accent)" />
          <StatisticsChart title={t("completionsByMonth")} unit={t("projectsUnit")} points={points("completedProjects", value => number(value))} compact />
          {report.coverage.missingCompletionDates ? <p className="text-xs text-[var(--ui-warning-text)]">{t("undatedProjects", { count: report.coverage.missingCompletionDates })}</p> : null}
        </div>
      </section>

      <section id="stats-credits" aria-labelledby="stats-credits-title" className={panel}>
        <div className="px-5 pt-4"><h2 id="stats-credits-title" className="flex items-center justify-between text-base font-semibold text-[var(--ui-text)]">{t("creditsTitle")}<StatisticsInfo label={t("creditedArea")}><p>{t("creditsDefinition")}</p><p>{t("creditHistoryNote")}</p><p>{coverage(report.coverage.creditFrom)}</p><p>{t("taskContextNote")}</p></StatisticsInfo></h2></div>
        <Headline label={t("creditedArea")} value={number(report.totals.creditedArea, 1)} unit={t("squareMetres")} />
        <div className="px-5 pb-5">
          <StatisticsChart title={t("creditedByMonth")} unit={t("squareMetres")} points={points("creditedArea", area)} kind="line" color="var(--ui-info-text)" />
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--ui-border)] pt-4 text-xs">
            <div><dt className="leading-5 text-[var(--ui-text-muted)]">{t("recordedTasks")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--ui-text)]">{number(report.totals.completedTasks)}</dd></div>
            <div><dt className="leading-5 text-[var(--ui-text-muted)]">{t("contributors")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--ui-text)]">{number(report.totals.contributors)}</dd></div>
          </dl>
          {report.coverage.excludedCredits ? <p className="mt-4 text-xs text-[var(--ui-warning-text)]">{t("undatedCreditsExcluded")}</p> : null}
        </div>
      </section>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section id="stats-economics" aria-labelledby="stats-economics-title" className={panel}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div><h2 id="stats-economics-title" className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)]">{t("economicsTitle")}<StatisticsInfo label={t("economicsTitle")}><p>{t("payrollDefinition")}</p><p>{t("closedMonthsOnly")}</p><p>{coverage(report.coverage.payrollFrom)}</p></StatisticsInfo></h2></div><Link href="/finance/schedules" className="inline-flex shrink-0 items-center gap-1 py-1 text-xs text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]">{t("finance")}<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></div>
        <div className="space-y-4 p-5">
          {currencies.length ? currencies.map(currency => <div key={currency} className="space-y-3">
            <StatisticsChart title={t("knownPayrollCost")} unit={currency} points={report.months.map(month => {
              const row = report.payroll.find(row => row.month === month.month && row.currency === currency);
              return { month: month.month, value: row && canChartFinanceAmount(row.knownCost, 4) ? Number(row.knownCost) : null,
                display: row ? money(row.knownCost, currency) : t("unavailable"),
                detail: row ? [row.incomplete ? t("incompleteCost") : t("recordedObligations", { count: row.obligations }), row.estimated ? t("estimatedCost") : ""].filter(Boolean).join(" · ") : undefined };
            })} />
            {report.payroll.some(row => row.currency === currency && row.incomplete) ? <p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t("partialPayroll", { count: report.payroll.filter(row => row.currency === currency && row.incomplete).length, total: report.payroll.filter(row => row.currency === currency).length })}</p> : null}
            {report.payroll.some(row => row.currency === currency && row.estimated) ? <p className="text-xs text-[var(--ui-text-muted)]">{t("estimatedCost")}</p> : null}
          </div>) : <p className="py-2 text-sm leading-6 text-[var(--ui-text-muted)]">{t("noPayrollHistory")}</p>}
          {currencies.length ? <StatisticsChart title={t("creditedSameMonths")} unit={t("squareMetres")} points={report.months.map(month => {
            const value = report.payroll.some(row => row.month === month.month) ? month.creditedArea : null;
            return { month: month.month, value, display: value === null ? t("unavailable") : area(value) };
          })} kind="line" color="var(--ui-info-text)" compact /> : null}
          {hasRatio ? <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4">
            <h3 className="flex items-center justify-between text-sm font-medium text-[var(--ui-text)]">{t("ratioTitle")}<StatisticsInfo label={t("ratioTitle")}><p>{t("ratioDefinition")}</p></StatisticsInfo></h3>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ui-text-secondary)]">{report.payroll.filter(row => row.costPerCreditedM2 !== null).map(row => <li key={`${row.month}:${row.currency}`}><span className="text-xs text-[var(--ui-text-muted)]">{date(row.month)}</span> <strong className="font-semibold tabular-nums">{number(row.costPerCreditedM2, 2)} {row.currency}/{t("squareMetres")}</strong>{row.estimated ? <span className="ml-1 text-xs">· {t("estimatedCost")}</span> : null}</li>)}</ul>
          </div> : <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("ratioUnavailable")}</p>}
        </div>
      </section>

      <section id="stats-duration" aria-labelledby="stats-duration-title" className={panel}>
        <div className="px-5 pt-4"><h2 id="stats-duration-title" className="flex items-center justify-between text-base font-semibold text-[var(--ui-text)]">{t("durationTitle")}<StatisticsInfo label={t("durationTitle")}><p>{t("durationDefinition")}</p><p>{t("durationLimit")}</p></StatisticsInfo></h2></div>
        <Headline label={t("medianDuration")} value={number(report.totals.medianDays, 1)} unit={t("days")} hint={t("durationCoverage", { count: report.coverage.durationProjects, total: report.coverage.selectedProjects })} />
        <div className="px-5 pb-5">
          {report.durations.length ? <>
            <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{[{ project: fastest, label: t("fastest") }, { project: longest, label: t("longest") }].map(({ project, label }, index) => project ? <div key={label} data-testid="duration-highlight" className={`min-w-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 ${index === 0 ? "bg-[var(--ui-surface-subtle)]" : "bg-[var(--ui-surface)]"}`}><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{label}</p><p className="my-2 text-2xl font-semibold tabular-nums text-[var(--ui-text)]">{number(project.days)} <span className="text-xs font-normal">{t("days")}</span></p><Link href={`/projects/${project.id}`} className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]"><span className="truncate">{project.name}</span><ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" /></Link></div> : null)}</div>
            <div className="mb-3 flex justify-between text-xs text-[var(--ui-text-muted)]"><span>{t("durationDistribution")}</span><span className="tabular-nums">0 — {longest?.days} {t("days")}</span></div>
            <ol className="max-h-56 space-y-2 overflow-auto" aria-label={t("durationDistribution")}>{report.durations.map(project => <li key={project.id}><Link href={`/projects/${project.id}`} className="group grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3 rounded py-1 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]" title={t("durationProjectDetail", { start: date(project.started), end: date(project.completed), days: project.days })}><span className="min-w-0"><span className="block truncate text-xs text-[var(--ui-text-secondary)] group-hover:text-[var(--ui-text)]">{project.name}</span><span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded bg-[var(--ui-surface-muted)]"><span className="block h-full rounded bg-[var(--ui-text-secondary)]" style={{ width: `${Math.max(1, project.days / Math.max(1, longest?.days ?? 1) * 100)}%` }} /></span></span><span className="text-right text-xs tabular-nums text-[var(--ui-text)]">{number(project.days)} {t("days")}</span></Link></li>)}</ol>
            <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("meanDuration", { days: number(report.totals.meanDays, 1) })}</p>
            {new Set(report.durations.map(project => project.completed.slice(0, 7))).size > 1 ? <div className="mt-4"><StatisticsChart title={t("durationTrend")} unit={t("days")} points={points("durationMedian", value => `${number(value, 1)} ${t("days")}`)} kind="line" compact /></div> : null}

          </> : <p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("noDurationHistory")}</p>}
        </div>
      </section>
    </div>
    </>}
    <details className="text-xs text-[var(--ui-text-muted)]"><summary className="w-fit cursor-pointer rounded py-2 font-medium focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("definitions")}</summary><div className="mt-2 grid gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 leading-6 md:grid-cols-2"><p>{t("projectHistoryNote")}</p><p>{t("creditHistoryNote")}</p><p>{t("payrollHistoryNote")}</p><p>{t("omittedNote")}</p><p>{t("recordCoverageNote")}</p><p>{t("crmMethodology")}</p><p>{t("attendanceMethodology")}</p><p>{t("calendarMethodology")}</p></div></details>
  </div>;
}

function Headline({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return <div className="min-w-0 px-5 py-4"><p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{label}</p><p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-semibold tabular-nums tracking-tight text-[var(--ui-text)]"><span className="text-3xl sm:text-[2.15rem]">{value}</span>{unit ? <span className="text-sm font-medium tracking-normal text-[var(--ui-text-muted)]">{unit}</span> : null}</p>{hint ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{hint}</p> : null}</div>;
}
