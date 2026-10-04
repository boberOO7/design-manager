import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatisticsChart } from "@/components/statistics/statistics-chart";
import { statisticsPeriods, statisticsSections, type StatisticsSection } from "@/lib/statistics";
import type { StatisticsPageReport } from "@/data/queries/statistics";
import { StatisticsCardHeader, StatisticsMetric as Headline, statisticsPanel as panel } from "./statistics-card";
import { LeadsStatistics, TeamStatistics, CalendarStatistics } from "./statistics-sections";
import { OngoingProjects } from "./ongoing-projects";
import { StatisticsMotion } from "./statistics-motion";

export async function StatisticsReportView({ report, section }: { report: StatisticsPageReport; section: StatisticsSection }) {
  const [t, locale] = await Promise.all([getTranslations("Statistics"), getLocale()]);
  const number = (value: number | null, digits = 0) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const area = (value: number | null) => value === null ? "—" : `${number(value, 1)} ${t("squareMetres")}`;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  const coverage = (from: string | null) => from ? t("recordsFrom", { date: date(from) }) : t("noRecordedHistory");
  const currentMonth = `${report.today.slice(0, 7)}-01`;
  const points = (key: "physicalArea" | "completedProjects" | "creditedArea" | "completedTasks" | "durationMedian", formatter: (value: number | null) => string) => report.months.map(month => ({
    month: month.month, value: month[key], display: month[key] === null ? t("unavailable") : formatter(month[key]), detail: month.month === currentMonth ? t("partialMonth") : undefined,
  }));
  const fastest = report.durations[0], longest = report.durations.at(-1);

  return <div className="w-full min-w-0 space-y-4" data-testid="statistics-report">
    <PageHeader title={t("title")} description={t("description")} className="flex-col items-start gap-3 lg:flex-row lg:items-end" action={
      <div className="flex items-center gap-2.5 text-xs text-[var(--ui-text-muted)]"><CalendarDays className="size-4 shrink-0" aria-hidden="true" /><div><p className="font-medium tabular-nums text-[var(--ui-text-secondary)]">{date(report.from)} — {date(report.through)}</p><p className="mt-0.5">{t("partialMonth")}</p></div></div>} />

    <div className="flex flex-wrap items-center justify-between gap-3">
    <nav aria-label={t("sections")} className="grid w-full grid-cols-4 gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1 sm:flex sm:w-fit">
      {statisticsSections.map(item => <Link key={item} href={`/statistics?period=${report.period}&section=${item}`} scroll={false} aria-current={section === item ? "page" : undefined} className="flex min-h-11 items-center justify-center rounded-[var(--ui-radius-control)] px-2 text-xs font-medium sm:px-4 sm:text-sm text-[var(--ui-text-secondary)] transition-colors duration-[180ms] hover:bg-[var(--ui-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)]">{t(`section_${item}`)}</Link>)}
    </nav>
    <nav aria-label={t("period")} className="flex max-w-full flex-wrap gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-1">
      {statisticsPeriods.map(period => <Link key={period} href={`/statistics?period=${period}&section=${section}`} scroll={false} aria-current={report.period === period ? "page" : undefined}
        className={`rounded-[calc(var(--ui-radius-control)-2px)] px-2.5 py-2 text-xs font-medium transition-colors duration-[180ms] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] sm:px-3 ${report.period === period ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)]"}`}>{t(`period${period}`)}</Link>)}
    </nav>
    </div>
    <StatisticsMotion section={section} period={report.period}>
    {section === "leads" ? <LeadsStatistics report={report.leads} /> : section === "team" ? <TeamStatistics report={report.attendance} today={report.today} /> : section === "calendar" ? <CalendarStatistics report={report.calendar} /> : <>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section data-statistics-reveal="0" id="stats-production" aria-labelledby="stats-production-title" className={panel}>
        <StatisticsCardHeader titleId="stats-production-title" title={t("productionTitle")} infoLabel={t("physicalArea")} info={<><p>{t("physicalDefinition")}</p><p>{t("projectHistoryNote")}</p><p>{coverage(report.coverage.completionFrom)}</p></>} />
        <div className="grid grid-cols-2 divide-x divide-[var(--ui-border)] border-b border-[var(--ui-border)] [&>div>p:first-child]:min-h-10 sm:[&>div>p:first-child]:min-h-5">
          <Headline className="p-5" label={t("completedProjects")} value={number(report.totals.completedProjects)} />
          <Headline className="p-5" label={t("physicalArea")} value={number(report.totals.physicalArea, 1)} unit={t("squareMetres")} hint={t("countedOnce")} />
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <StatisticsChart showData={false} title={t("physicalArea")} unit={t("squareMetres")} points={points("physicalArea", area)} color="var(--ui-success-accent)" />
          <StatisticsChart showData={false} title={t("completionsByMonth")} unit={t("projectsUnit")} points={points("completedProjects", value => number(value))} />
          {report.coverage.missingCompletionDates ? <p className="text-xs text-[var(--ui-warning-text)] lg:col-span-2">{t("undatedProjects", { count: report.coverage.missingCompletionDates })}</p> : null}
        </div>
      </section>

      <section data-statistics-reveal="1" id="stats-credits" aria-labelledby="stats-credits-title" className={panel}>
        <StatisticsCardHeader titleId="stats-credits-title" title={t("creditsTitle")} infoLabel={t("creditedArea")} info={<><p>{t("creditsDefinition")}</p><p>{t("creditHistoryNote")}</p><p>{coverage(report.coverage.creditFrom)}</p><p>{t("taskContextNote")}</p></>} />
        <Headline className="p-5" label={t("creditedArea")} value={number(report.totals.creditedArea, 1)} unit={t("squareMetres")} hint={t("creditedNote")} />
        <div className="px-5 pb-5">
          <StatisticsChart showData={false} title={t("creditedByMonth")} unit={t("squareMetres")} points={points("creditedArea", area)} kind="line" color="var(--ui-info-text)" compact />
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--ui-border)] pt-4 text-xs">
            <div><dt className="leading-5 text-[var(--ui-text-muted)]">{t("recordedTasks")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--ui-text)]">{number(report.totals.completedTasks)}</dd></div>
            <div><dt className="leading-5 text-[var(--ui-text-muted)]">{t("contributors")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--ui-text)]">{number(report.totals.contributors)}</dd></div>
          </dl>
          {report.coverage.excludedCredits ? <p className="mt-4 text-xs text-[var(--ui-warning-text)]">{t("undatedCreditsExcluded")}</p> : null}
        </div>
      </section>
    </div>

      <section data-statistics-reveal="2" id="stats-duration" aria-labelledby="stats-duration-title" className={panel}>
        <StatisticsCardHeader titleId="stats-duration-title" title={t("durationTitle")} infoLabel={t("durationTitle")} info={<><p>{t("durationDefinition")}</p><p>{t("durationLimit")}</p><p>{t("durationCoverage", { count: report.coverage.durationProjects, total: report.coverage.selectedProjects })}</p>{report.coverage.durationProjects < report.coverage.selectedProjects ? <p>{t("durationExcluded", { count: report.coverage.selectedProjects - report.coverage.durationProjects })}</p> : null}</>} />
        <div className="grid divide-y divide-[var(--ui-border)] lg:grid-cols-2 lg:divide-x lg:divide-y-0"><div>
        <Headline className="p-5" context={t("completedInPeriod")} label={t("medianDuration")} value={number(report.totals.medianDays, 1)} unit={t("days")} hint={t("durationCoverageShort", { count: report.coverage.durationProjects, total: report.coverage.selectedProjects })} />
        <div className="px-5 pb-5">
          {report.durations.length ? <>
            <div className="mb-4 grid grid-cols-2 gap-2">{[{ project: fastest, label: t("fastest") }, { project: longest, label: t("longest") }].map(({ project, label }, index) => project ? <div key={label} data-testid="duration-highlight" className={`min-w-0 rounded-[var(--ui-radius-control)] p-3 ${index === 0 ? "bg-[var(--ui-surface-subtle)]" : "bg-[var(--ui-surface-muted)]"}`}><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{label}</p><p className="my-1 text-2xl font-semibold tabular-nums text-[var(--ui-text)]">{number(project.days)} <span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("days")}</span></p><Link href={`/projects/${project.id}`} title={project.name} className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]"><span className="truncate">{project.name}</span><ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" /></Link></div> : null)}</div>
            <div className="mb-3 flex justify-between text-xs text-[var(--ui-text-muted)]"><span>{t("durationDistribution")}</span><span className="tabular-nums">0 — {longest?.days} {t("days")}</span></div>
            <ol className="max-h-40 space-y-2 overflow-y-auto pr-1 [scrollbar-gutter:stable]" aria-label={t("durationDistribution")}>{report.durations.map(project => <li key={project.id}><Link href={`/projects/${project.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded py-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)]" title={t("durationProjectDetail", { start: date(project.started), end: date(project.completed), days: project.days })}><span className="min-w-0"><span className="block truncate text-xs text-[var(--ui-text-secondary)] group-hover:text-[var(--ui-text)]">{project.name}</span><span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded bg-[var(--ui-surface-muted)]"><span data-statistics-progress className="block h-full rounded bg-[var(--ui-text-secondary)]" style={{ width: `${Math.max(1, project.days / Math.max(1, longest?.days ?? 1) * 100)}%` }} /></span></span><span className="whitespace-nowrap text-right text-xs tabular-nums text-[var(--ui-text)]">{number(project.days)} {t("days")}</span></Link></li>)}</ol>
            <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("meanDuration", { days: number(report.totals.meanDays, 1) })}</p>
            {new Set(report.durations.map(project => project.completed.slice(0, 7))).size > 1 ? <div className="mt-4"><StatisticsChart showData={false} title={t("durationTrend")} unit={t("days")} points={points("durationMedian", value => `${number(value, 1)} ${t("days")}`)} kind="line" compact /></div> : null}

          </> : <p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("noDurationHistory")}</p>}
        </div>
        </div><div id="stats-ongoing" className="min-w-0">
          <Headline className="p-5" context={t("ongoingAsOf", { date: date(report.today) })} label={t("medianAge")} value={number(report.totals.medianAge, 1)} unit={t("days")} hint={t("ongoingCoverageShort", { count: report.ongoing.length, total: report.coverage.ongoingProjects })} info={<><p>{t("ongoingDefinition")}</p><p>{t("ongoingCoverage", { count: report.ongoing.length, total: report.coverage.ongoingProjects })}</p>{report.ongoing.length < report.coverage.ongoingProjects ? <p>{t("ongoingHistoryGap", { count: report.coverage.ongoingProjects - report.ongoing.length })}</p> : null}</>} />
          <div className="px-5 pb-5"><h3 className="mb-3 text-sm font-medium text-[var(--ui-text)]">{t("longestRunning")}</h3>
            {report.ongoing.length ? <OngoingProjects projects={report.ongoing} /> : <p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("noOngoingHistory")}</p>}
          </div>
        </div></div>
      </section>

    </>}
    <details className="text-xs text-[var(--ui-text-muted)]"><summary className="w-fit cursor-pointer rounded py-2 font-medium transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("definitions")}</summary><dl className="mt-2 divide-y divide-[var(--ui-border)] rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] px-4 leading-5">{["history", section].map(key => <div key={key} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]"><dt className="font-medium text-[var(--ui-text-secondary)]">{t(`method_${key}_label`)}</dt><dd>{t(`method_${key}`)}</dd></div>)}</dl></details>
    </StatisticsMotion>
  </div>;
}
