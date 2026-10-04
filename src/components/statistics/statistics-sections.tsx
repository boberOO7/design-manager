import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { CrmStatisticsReport } from "@/lib/statistics-crm";
import { attendanceCategories, type AttendanceStatistics, type AttendanceLeave } from "@/lib/statistics-attendance";
import type { StatisticsCalendarReport } from "@/lib/statistics-calendar";
import { StatisticsChart } from "./statistics-chart";
import { StatisticsInfo } from "./statistics-info";

const panel = "min-w-0 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]";
const tableClass = "w-full text-left text-xs [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3";
async function presentation() {
  const [t, locale] = await Promise.all([getTranslations("Statistics"), getLocale()]);
  const number = (value: number | null, digits = 1) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  return { t, number, date };
}
function Title({ title, info, children }: { title: string; info: string; children?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-3"><h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)]">{title}<StatisticsInfo label={title}><p>{info}</p></StatisticsInfo></h2>{children}</div>;
}
function Value({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return <div className="min-w-0"><p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{label}</p><p className="mt-1 font-semibold tabular-nums text-[var(--ui-text)]"><span className="text-3xl">{value}</span>{unit ? <span className="ml-2 text-xs font-normal text-[var(--ui-text-muted)]">{unit}</span> : null}</p>{hint ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{hint}</p> : null}</div>;
}
function Comparison({ label, value, total, detail }: { label: string; value: number; total: number; detail?: string }) {
  return <div><div className="mb-2 flex justify-between gap-4 text-xs"><span className="text-[var(--ui-text-secondary)]">{label}</span><span className="text-right tabular-nums text-[var(--ui-text)]">{value}{detail ? <span className="ml-3 text-[var(--ui-text-muted)]">{detail}</span> : null}</span></div><div aria-hidden="true" className="h-1.5 rounded bg-[var(--ui-surface-muted)]"><div className="h-full rounded bg-[var(--ui-text-secondary)]" style={{ width: `${total ? value / total * 100 : 0}%` }} /></div></div>;
}

export async function LeadsStatistics({ report }: { report: CrmStatisticsReport }) {
  const { t, number, date } = await presentation();
  const { cohort, contactToStart, sources } = report;
  return <div id="stats-leads" className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <section className={panel}>
      <Title title={t("leadsTitle")} info={t("crmMethodology")}><Link href="/crm/leads" className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--ui-text-secondary)]">CRM<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></Title>
      <div className="space-y-5 p-5"><Value label={t("newLeads")} value={number(cohort.sample)} hint={cohort.excludedInvalid ? t("invalidLeadsExcluded", { count: cohort.excludedInvalid }) : undefined} />
        <StatisticsChart title={t("newLeadsByMonth")} unit={t("leadsUnit")} points={report.months.map(row => ({ month: row.month, value: row.newLeads, display: number(row.newLeads) }))} />
        <p className="text-xs text-[var(--ui-text-muted)]">{t("recordedCountsNote")}</p>
      </div>
    </section>
    <section className={panel}>
      <Title title={t("cohortOutcomes")} info={t("cohortDefinition")} />
      <div className="space-y-5 p-5"><p className="text-xs text-[var(--ui-text-muted)]">{t("asOf", { date: date(report.asOf) })}</p>
        <Value label={t("cohortSuccess")} value={number(cohort.successRate === null ? null : cohort.successRate * 100)} unit="%" hint={t("cohortSample", { won: cohort.won, count: cohort.sample })} />
        <div className="space-y-4">{(["open", "won", "lost"] as const).map(key => <Comparison key={key} label={t(`lead_${key}`)} value={cohort[key]} total={cohort.sample} />)}</div>
        <div className="border-t border-[var(--ui-border)] pt-4"><Value label={t("contactToStart")} value={number(contactToStart.medianDays)} unit={t("days")} hint={t("contactSample", { count: contactToStart.sample, total: cohort.won })} />{contactToStart.sample === 0 ? <p className="mt-2 text-xs leading-5 text-[var(--ui-text-muted)]">{t("contactUnavailable")}</p> : null}</div>
      </div>
    </section>
    {sources.known.length ? <section className={`${panel} xl:col-span-2`}><Title title={t("leadSources")} info={t("sourcesDefinition")} /><div className="p-5"><p className="mb-4 text-xs text-[var(--ui-text-muted)]">{t("sourceCoverage", { count: sources.knownCount, total: cohort.sample, unknown: sources.unknownCount })}</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.known.map(source => <Comparison key={source.source} label={source.source} value={source.count} total={cohort.sample} />)}</div></div></section> : null}
  </div>;
}

export async function TeamStatistics({ report, today }: { report: AttendanceStatistics; today: string }) {
  const { t, number, date } = await presentation();
  const leave = (value: { days: number; hours: number }) => [value.days ? `${number(value.days)} ${t("calendarDaysShort")}` : "", value.hours ? `${number(value.hours)} ${t("hoursShort")}` : ""].filter(Boolean).join(" + ") || "0";
  const future = (values: AttendanceLeave) => attendanceCategories.filter(category => values[category].days || values[category].hours).map(category => `${t(`absence_${category}`)}: ${leave(values[category])}`).join(" · ");
  const categories = attendanceCategories.filter(category => category === "vacation" || category === "day_off" || report.employees.some(employee => employee.elapsedLeave[category].days || employee.elapsedLeave[category].hours));
  const hasFuture = report.employees.some(employee => future(employee.futureLeave) || employee.plannedMakeupHours !== 0);
  return <section id="stats-team" className={panel}>
    <Title title={t("teamTitle")} info={t("attendanceMethodology")} />
    <div className="flex flex-wrap gap-x-10 gap-y-4 px-5 py-5"><Value label={t("absence_vacation")} value={number(report.totals.elapsedLeave.vacation.days)} unit={t("calendarDaysShort")} /><Value label={t("elapsedMakeup")} value={number(report.totals.boundaryMakeupCount && !report.totals.elapsedMakeupHours ? null : report.totals.elapsedMakeupHours)} unit={t("hoursShort")} /></div>
    {report.totals.boundaryMakeupCount ? <p className="px-5 pb-4 text-xs leading-5 text-[var(--ui-warning-text)]">{t("boundaryMakeup", { count: report.totals.boundaryMakeupCount })}</p> : null}
    <div className="overflow-x-auto border-t border-[var(--ui-border)]" role="region" aria-label={t("teamTitle")} tabIndex={0}>
      <table className={tableClass}><caption className="sr-only">{t("teamTitle")}</caption><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"><tr><th scope="col" className="sticky left-0 z-20 min-w-44 border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]">{t("employee")}</th>{categories.map(category => <th key={category} scope="col" className="min-w-28">{t(`absence_${category}`)}</th>)}<th scope="col" className="min-w-32">{t("elapsedMakeup")} · {t("hoursShort")}</th>{hasFuture ? <th scope="col" className="w-40 min-w-40 border-l border-[var(--ui-border)] sm:w-auto sm:min-w-64">{t("futureCommitments")}<span className="mt-1 block font-normal text-[var(--ui-text-muted)]">{t("asOf", { date: date(today) })}</span></th> : null}</tr></thead>
        <tbody>{report.employees.map(employee => <tr key={employee.id} className="border-t border-[var(--ui-border)] text-[var(--ui-text-secondary)]"><th scope="row" className="sticky left-0 z-10 border-r border-[var(--ui-border)] bg-[var(--ui-surface)] font-medium text-[var(--ui-text)]"><Link href={`/team/${employee.id}`} className="hover:underline">{employee.name || t("formerEmployee")}</Link>{!employee.active ? <span className="mt-1 block text-[10px] font-normal text-[var(--ui-text-muted)]">{t("inactiveEmployee")}</span> : null}</th>{categories.map(category => <td key={category} className="whitespace-nowrap tabular-nums">{leave(employee.elapsedLeave[category])}</td>)}<td className="tabular-nums">{number(employee.boundaryMakeupCount && !employee.elapsedMakeupHours ? null : employee.elapsedMakeupHours)}{employee.boundaryMakeupCount ? <span className="mt-1 block text-[10px] text-[var(--ui-text-muted)]">{t("unallocatedMakeup", { count: employee.boundaryMakeupCount })}</span> : null}</td>{hasFuture ? <td className="border-l border-[var(--ui-border)] text-[var(--ui-text-muted)]"><p>{future(employee.futureLeave)}</p>{employee.plannedMakeupHours === null ? <p><Link href="/calendar" className="underline underline-offset-2">{t("futureRecurringMakeup")}</Link></p> : employee.plannedMakeupHours ? <p>{t("plannedMakeup")}: {number(employee.plannedMakeupHours)} {t("hoursShort")}</p> : null}{!future(employee.futureLeave) && employee.plannedMakeupHours === 0 ? "—" : null}</td> : null}</tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-2 border-t border-[var(--ui-border)] px-5 py-4 text-xs leading-5 text-[var(--ui-text-muted)]"><p>{t("attendanceUnits")}</p><p>{t("balanceOmitted")} <Link href="/team" className="underline underline-offset-2">{t("employeeProfiles")}</Link></p></div>
  </section>;
}

export async function CalendarStatistics({ report }: { report: StatisticsCalendarReport }) {
  const { t, number } = await presentation();
  const hours = (count: number) => `${number(count)} ${t("hoursShort")}`;
  return <div id="stats-calendar" className="space-y-5">
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className={panel}><Title title={t("calendarTitle")} info={t("calendarMethodology")} /><div className="space-y-6 p-5">
        <div className="grid gap-5 sm:grid-cols-3"><Value label={t("elapsedEvents")} value={number(report.totals.count)} /><Value label={t("measurableHours")} value={number(report.totals.timedCount ? report.totals.hours : null)} unit={t("hoursShort")} /><Value label={t("averageDuration")} value={number(report.totals.averageHours)} unit={t("hoursShort")} hint={t("timedSample", { count: report.totals.timedCount })} /></div>
        <div className="space-y-4">{report.categories.map(category => <Comparison key={category.eventType} label={t(`event_${category.eventType}`)} value={category.count} total={Math.max(1, ...report.categories.map(row => row.count))} detail={[category.timedCount ? hours(category.hours) : "", category.allDayCount ? t("allDayCount", { count: category.allDayCount, days: number(category.allDayDays) }) : ""].filter(Boolean).join(" · ")} />)}</div>
        {report.plannedCount || report.ongoingCount ? <p className="border-t border-[var(--ui-border)] pt-4 text-xs text-[var(--ui-text-muted)]">{t("calendarPending", { planned: report.plannedCount, ongoing: report.ongoingCount })}</p> : null}
        {report.unknownTimingCount || report.totals.unknownDurationCount ? <p className="text-xs text-[var(--ui-warning-text)]">{t("calendarUnknown", { count: report.unknownTimingCount + report.totals.unknownDurationCount })}</p> : null}
      </div></section>
      <section className={panel}><Title title={t("eventsByMonth")} info={t("calendarPeriodDefinition")} /><div className="space-y-4 p-5"><StatisticsChart title={t("elapsedEvents")} unit={t("eventsUnit")} points={report.months.map(row => ({ month: row.month, value: row.count, display: number(row.count) }))} /><StatisticsChart title={t("measurableHours")} unit={t("hoursShort")} compact kind="line" points={report.months.map(row => ({ month: row.month, value: row.timedCount ? row.hours : null, display: row.timedCount ? hours(row.hours) : t("unavailable") }))} /><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("recordedCountsNote")}</p></div></section>
    </div>
    <section className={panel}><Title title={t("projectEventTitle")} info={t("projectEventDefinition")} /><div className="flex flex-wrap gap-x-10 gap-y-5 p-5"><Value label={t("linkedEvents")} value={number(report.projectLinked.count)} hint={report.projectLinked.timedCount ? hours(report.projectLinked.hours) : t("noTimedEvents")} /><Value label={t("eventsPerProject")} value={number(report.projectAverages.count)} hint={t("projectDenominator", { count: report.projectAverages.projectCount })} /><Value label={t("hoursPerProject")} value={number(report.projectAverages.hours)} unit={t("hoursShort")} /><Value label={t("unlinkedEvents")} value={number(report.unlinked.count)} hint={report.unlinked.timedCount ? hours(report.unlinked.hours) : t("noTimedEvents")} /></div>
      {report.projects.length ? <details className="border-t border-[var(--ui-border)] px-5 py-3 text-xs text-[var(--ui-text-secondary)]"><summary className="w-fit cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("projectEventDetails")}</summary><div className="mt-2 overflow-x-auto"><table className={tableClass}><thead><tr><th scope="col">{t("project")}</th><th scope="col">{t("eventsUnit")}</th><th scope="col">{t("measurableHours")}</th><th scope="col">{t("calendarDaysShort")}</th></tr></thead><tbody>{report.projects.map(project => <tr key={project.id} className="border-t border-[var(--ui-border)]"><th scope="row" className="font-normal">{project.name ? <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link> : t("unavailableProject")}</th><td>{number(project.count)}</td><td>{project.timedCount ? hours(project.hours) : "—"}</td><td>{number(project.allDayDays)}</td></tr>)}</tbody></table></div></details> : null}
    </section>
  </div>;
}
