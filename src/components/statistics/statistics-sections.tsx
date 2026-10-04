import Link from "next/link";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getCalendarEventTypeConfig } from "@/lib/calendar-event-types";
import { getCreatableCalendarEventTypes } from "@/lib/calendar-creation";
import { getCrmLeadStatusBadgeStyle } from "@/lib/semantic-styles";
import { isCrmLeadSourceKey } from "@/lib/validation/crm";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { CrmStatisticsReport } from "@/lib/statistics-crm";
import { attendanceCategories, type AttendanceStatistics, type AttendanceLeave } from "@/lib/statistics-attendance";
import type { StatisticsCalendarReport } from "@/lib/statistics-calendar";
import { StatisticsChart } from "./statistics-chart";
import { StatisticsInfo } from "./statistics-info";
import { StatisticsCardHeader as Title, StatisticsMetric as Value, statisticsPanel as panel, statisticsTable as tableClass } from "./statistics-card";

async function presentation() {
  const [t, locale] = await Promise.all([getTranslations("Statistics"), getLocale()]);
  const number = (value: number | null, digits = 1) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  return { t, number, date };
}
function Comparison({ label, value, total, detail, color, eventType }: { label: React.ReactNode; value: number; total: number; detail?: string; color?: string; eventType?: string }) {
  return <div><div className="mb-2 flex justify-between gap-4 text-xs"><span className="min-w-0 text-[var(--ui-text-secondary)]">{label}</span><span className="text-right tabular-nums text-[var(--ui-text)]">{value}{detail ? <span className="mt-1 block text-[var(--ui-text-muted)]">{detail}</span> : null}</span></div><div aria-hidden="true" className="h-1.5 rounded bg-[var(--ui-surface-muted)]"><div data-statistics-progress data-event-type={eventType} className="h-full rounded" style={{ width: `${total ? value / total * 100 : 0}%`, backgroundColor: color ?? "var(--ui-text-secondary)" }} /></div></div>;
}

export async function LeadsStatistics({ report }: { report: CrmStatisticsReport }) {
  const { t, number, date } = await presentation();
  const { cohort, contactToStart, sources, lifecycle } = report;
  const crm = await getTranslations("Crm");
  return <div id="stats-leads" className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <div className="min-w-0 space-y-4">
      <section data-statistics-reveal="0" className={panel}>
        <Title title={t("leadsTitle")} info={t("crmMethodology")}><Link href="/crm/leads" className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--ui-text-secondary)]">CRM<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></Title>
        <div className="space-y-4 p-5"><Value label={t("newLeads")} value={number(cohort.sample)} hint={cohort.excludedInvalid ? t("invalidLeadsExcluded", { count: cohort.excludedInvalid }) : undefined} />
          <StatisticsChart title={t("newLeadsByMonth")} unit={t("leadsUnit")} points={report.months.map(row => ({ month: row.month, value: row.newLeads, display: number(row.newLeads) }))} compact />
        </div>
      </section>
      <section data-statistics-reveal="1" id="stats-lead-timing" className={panel}>
        <Title title={t("leadTimingTitle")} info={t("leadTimingDefinition")} />
        <div className="overflow-x-auto" role="region" aria-label={t("leadTimingTitle")} tabIndex={0}><table className={tableClass}><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"><tr><th scope="col" className="font-medium">{t("stageOrTransition")}</th><th scope="col" className="whitespace-nowrap text-right font-medium">{t("medianDaysLabel")}</th><th scope="col" className="whitespace-nowrap text-right font-medium">{t("meanDaysLabel")}</th><th scope="col" className="font-medium">{t("observations")}</th></tr></thead><tbody className="divide-y divide-[var(--ui-border-subtle)] text-[var(--ui-text-secondary)] [&_td:nth-child(2)]:text-right [&_td:nth-child(3)]:text-right [&_td:nth-child(2)]:tabular-nums [&_td:nth-child(3)]:tabular-nums [&_td:last-child]:text-[var(--ui-text-muted)]">
          <tr><th scope="row" className="min-w-52 font-medium text-[var(--ui-text)]">{t("newToContact")}</th><td>{number(lifecycle.firstContact.medianDays)}</td><td>{number(lifecycle.firstContact.meanDays)}</td><td>{lifecycle.firstContact.sample ? t("leadSample", { count: lifecycle.firstContact.sample, total: cohort.sample }) : t("noReliableHistory")}</td></tr>
          {lifecycle.stages.map(stage => <tr key={stage.status}><th scope="row" className="font-medium text-[var(--ui-text)]"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`${getCrmLeadStatusBadgeStyle(stage.status).className} flex size-3 shrink-0 items-center justify-center rounded-full border-0! bg-transparent!`}><span className="size-1.5 rounded-full bg-current" /></span>{crm(`leadStatus.${stage.status}`)}</span></th><td>{number(stage.medianDays)}</td><td>{number(stage.meanDays)}</td><td>{stage.sample ? t("stageSample", { count: stage.sample, leads: stage.leads }) : t("noReliableHistory")}</td></tr>)}
          <tr className="bg-[var(--ui-surface-subtle)]"><th scope="row" className="font-medium text-[var(--ui-text)]">{t("contactToStart")}</th><td>{number(contactToStart.medianDays)}</td><td>{number(contactToStart.meanDays)}</td><td>{contactToStart.sample ? t("contactSample", { count: contactToStart.sample, total: cohort.won }) : t("noReliableHistory")}</td></tr>
        </tbody></table></div><p className="px-5 py-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("closedStagesOnly")}</p>
      </section>
    </div>
    <div className="min-w-0 space-y-4">
      <section data-statistics-reveal="2" className={panel}>
        <Title title={t("cohortOutcomes")} info={t("cohortDefinition")} />
        <div className="space-y-5 p-5"><p className="text-xs text-[var(--ui-text-muted)]">{t("asOf", { date: date(report.asOf) })}</p>
          <Value label={t("cohortSuccess")} value={number(cohort.successRate === null ? null : cohort.successRate * 100)} unit="%" hint={t("cohortSample", { won: cohort.won, count: cohort.sample })} />
          <div className="space-y-4">{(["open", "won", "lost"] as const).map(key => <Comparison key={key} label={t(`lead_${key}`)} value={cohort[key]} total={cohort.sample} />)}<Comparison label={t("lead_invalid")} value={cohort.excludedInvalid} total={cohort.sample + cohort.excludedInvalid} /></div>
        </div>
      </section>
      {sources.known.length ? <section data-statistics-reveal="3" className={panel}><Title title={t("leadSources")} info={t("sourcesDefinition")} /><div className="p-5"><p className="mb-4 text-xs text-[var(--ui-text-muted)]">{t("sourceCoverage", { count: sources.knownCount, total: cohort.sample, unknown: sources.unknownCount })}</p><div className="space-y-4">{sources.known.map(source => <Comparison key={source.source} label={isCrmLeadSourceKey(source.source) ? crm(`sourceOptions.${source.source}`) : source.source} value={source.count} total={cohort.sample} />)}</div></div></section> : null}
    </div>
  </div>;
}

export async function TeamStatistics({ report, today }: { report: AttendanceStatistics; today: string }) {
  const { t, number, date } = await presentation();
  const leave = (value: { days: number; hours: number }) => [value.days ? `${number(value.days)} ${t("calendarDaysShort")}` : "", value.hours ? `${number(value.hours)} ${t("hoursShort")}` : ""].filter(Boolean).join(" + ") || "0";
  const future = (values: AttendanceLeave) => attendanceCategories.filter(category => values[category].days || values[category].hours).map(category => `${t(`absence_${category}`)}: ${leave(values[category])}`).join(" · ");
  const categories = attendanceCategories.filter(category => category === "vacation" || category === "day_off" || report.employees.some(employee => employee.elapsedLeave[category].days || employee.elapsedLeave[category].hours));
  const hasFuture = report.employees.some(employee => future(employee.futureLeave) || employee.plannedMakeupHours !== 0);
  const makeupColor = getCalendarEventTypeConfig("work_makeup").color;
  return <section data-statistics-reveal="0" id="stats-team" className={panel}>
    <Title title={t("teamTitle")} info={t("attendanceMethodology")} />
    <div className="flex flex-wrap gap-x-10 gap-y-4 p-5"><div className="border-l-2 border-[var(--ui-success-accent)] pl-3"><Value label={t("absence_vacation")} value={number(report.totals.elapsedLeave.vacation.days)} unit={t("calendarDaysShort")} /></div><div className="border-l-2 pl-3" style={{ borderColor: makeupColor }}><Value label={t("elapsedMakeup")} value={number(report.totals.boundaryMakeupCount && !report.totals.elapsedMakeupHours ? null : report.totals.elapsedMakeupHours)} unit={t("hoursShort")} /></div></div>
    {report.totals.boundaryMakeupCount ? <p className="px-5 pb-4 text-xs leading-5 text-[var(--ui-warning-text)]">{t("boundaryMakeup", { count: report.totals.boundaryMakeupCount })}</p> : null}
    <div className="overflow-x-auto border-t border-[var(--ui-border)]" role="region" aria-label={t("teamTitle")} tabIndex={0}>
      <table className={tableClass}><caption className="sr-only">{t("teamTitle")}</caption><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"><tr><th scope="col" className="sticky left-0 z-20 min-w-44 border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]">{t("employee")}</th>{categories.map(category => <th key={category} scope="col" className="min-w-28 text-right"><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--ui-success-accent)]" />{t(`absence_${category}`)}</span></th>)}<th scope="col" className="min-w-32 border-l border-[var(--ui-border-subtle)] text-right text-[var(--ui-calendar-general-text)]"><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: makeupColor }} />{t("elapsedMakeup")} · {t("hoursShort")}</span></th>{hasFuture ? <th scope="col" className="w-40 min-w-40 border-l border-[var(--ui-border)] text-[var(--ui-text-muted)] sm:w-auto sm:min-w-64">{t("futureCommitments")}<span className="mt-1 block font-normal">{t("asOf", { date: date(today) })}</span></th> : null}</tr></thead>
        <tbody>{report.employees.map(employee => <tr key={employee.id} className="group border-t border-[var(--ui-border-subtle)] text-[var(--ui-text-secondary)] transition-colors duration-[180ms] hover:bg-[var(--ui-surface-subtle)]"><th scope="row" className="sticky left-0 z-10 border-r border-[var(--ui-border)] bg-[var(--ui-surface)] font-medium text-[var(--ui-text)] transition-colors duration-[180ms] group-hover:bg-[var(--ui-surface-subtle)]"><Link href={`/team/${employee.id}`} className="flex items-center gap-2.5 rounded hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><UserAvatar name={employee.name || t("formerEmployee")} size="boardCard" decorative /><span className="min-w-0"><span className="block">{employee.name || t("formerEmployee")}</span>{!employee.active ? <span className="mt-0.5 block text-[10px] font-normal text-[var(--ui-text-muted)]">{t("inactiveEmployee")}</span> : null}</span></Link></th>{categories.map(category => <td key={category} className={`whitespace-nowrap text-right tabular-nums ${employee.elapsedLeave[category].days || employee.elapsedLeave[category].hours ? "font-medium text-[var(--ui-success-text)]" : "text-[var(--ui-text-muted)]"}`}>{leave(employee.elapsedLeave[category])}</td>)}<td className={`border-l border-[var(--ui-border-subtle)] text-right tabular-nums ${employee.elapsedMakeupHours ? "font-medium text-[var(--ui-calendar-general-text)]" : "text-[var(--ui-text-muted)]"}`}>{number(employee.boundaryMakeupCount && !employee.elapsedMakeupHours ? null : employee.elapsedMakeupHours)}{employee.boundaryMakeupCount ? <span className="mt-1 block text-[10px] font-normal text-[var(--ui-text-muted)]">{t("unallocatedMakeup", { count: employee.boundaryMakeupCount })}</span> : null}</td>{hasFuture ? <td className="border-l border-[var(--ui-border)] text-[var(--ui-text-muted)]"><p>{future(employee.futureLeave)}</p>{employee.plannedMakeupHours === null ? <p><Link href="/calendar" className="underline underline-offset-2">{t("futureRecurringMakeup")}</Link></p> : employee.plannedMakeupHours ? <p>{t("plannedMakeup")}: {number(employee.plannedMakeupHours)} {t("hoursShort")}</p> : null}{!future(employee.futureLeave) && employee.plannedMakeupHours === 0 ? "—" : null}</td> : null}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center gap-1 border-t border-[var(--ui-border)] px-5 py-3 text-xs text-[var(--ui-text-muted)]"><Link href="/team" className="underline underline-offset-2">{t("balanceLink")}</Link><StatisticsInfo label={t("employeeProfiles")}><p>{t("attendanceUnits")}</p><p>{t("balanceOmitted")}</p></StatisticsInfo></div>
  </section>;
}

export async function CalendarStatistics({ report }: { report: StatisticsCalendarReport }) {
  const { t, number } = await presentation();
  const hours = (count: number) => `${number(count)} ${t("hoursShort")}`;
  const currentTypes = getCreatableCalendarEventTypes("admin");
  // Keep real legacy records, without advertising empty retired categories.
  const categories = report.categories.filter(category => currentTypes.includes(category.eventType) || category.count > 0);
  const series = categories.filter(category => category.count > 0);
  return <div id="stats-calendar" className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <section data-statistics-reveal="0" className={`${panel} flex flex-col`}><Title title={t("calendarTitle")} info={t("calendarMethodology")} /><div className="flex flex-1 flex-col gap-5 p-5">
        <div className="grid gap-5 sm:grid-cols-3"><Value label={t("elapsedEvents")} value={number(report.totals.count)} /><Value label={t("measurableHours")} value={number(report.totals.timedCount ? report.totals.hours : null)} unit={t("hoursShort")} /><Value label={t("averageDuration")} value={number(report.totals.averageHours)} unit={t("hoursShort")} hint={t("timedSample", { count: report.totals.timedCount })} /></div>
        <div className="flex flex-1 flex-col justify-between gap-4">{categories.map(category => {
          const { color, Icon } = getCalendarEventTypeConfig(category.eventType);
          const detail = [category.timedCount || category.count === 0 ? hours(category.hours) : "", category.allDayCount ? t("allDayCount", { count: category.allDayCount, days: number(category.allDayDays) }) : ""].filter(Boolean).join(" · ");
          return <div key={category.eventType} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-xs">
            <Icon aria-hidden="true" className="size-4 shrink-0" style={{ color }} />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 leading-4"><span className="text-[var(--ui-text-secondary)]">{t(`event_${category.eventType}`)}</span><span className="inline-flex items-baseline gap-2 whitespace-nowrap tabular-nums text-[var(--ui-text)]"><span>{number(category.count)} {t("eventsUnit")}</span>{detail ? <span className="text-[var(--ui-text-muted)]">{detail}</span> : null}</span></div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded bg-[var(--ui-surface-muted)]"><div data-statistics-progress data-event-type={category.eventType} className="h-full rounded" style={{ width: `${category.count / Math.max(1, ...categories.map(row => row.count)) * 100}%`, backgroundColor: color }} /></div>
            </div>
          </div>;
        })}</div>
        {report.plannedCount || report.ongoingCount ? <p className="border-t border-[var(--ui-border)] pt-4 text-xs text-[var(--ui-text-muted)]">{t("calendarPending", { planned: report.plannedCount, ongoing: report.ongoingCount })}</p> : null}
        {report.unknownTimingCount || report.totals.unknownDurationCount ? <p className="text-xs text-[var(--ui-warning-text)]">{t("calendarUnknown", { count: report.unknownTimingCount + report.totals.unknownDurationCount })}</p> : null}
      </div></section>
      <section data-statistics-reveal="1" id="stats-calendar-months" className={panel}><Title title={t("eventsByMonth")} info={t("calendarPeriodDefinition")} /><div className="space-y-5 p-5">
        <StatisticsChart title={t("elapsedEvents")} unit={t("eventsUnit")} showData={false} points={report.months.map(row => ({ month: row.month, value: row.count, display: number(row.count), segments: series.map(category => ({ key: category.eventType, label: t(`event_${category.eventType}`), color: getCalendarEventTypeConfig(category.eventType).color, value: row.types.find(type => type.eventType === category.eventType)?.count ?? 0, display: number(row.types.find(type => type.eventType === category.eventType)?.count ?? 0) })) }))} />
        {series.length ? <ul aria-label={t("eventTypes")} className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--ui-text-secondary)]">{series.map(category => <li key={category.eventType} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: getCalendarEventTypeConfig(category.eventType).color }} />{t(`event_${category.eventType}`)}</li>)}</ul> : null}
        <StatisticsChart title={t("measurableHours")} unit={t("hoursShort")} showData={false} compact kind="line" points={report.months.map(row => ({ month: row.month, value: row.timedCount ? row.hours : null, display: row.timedCount ? hours(row.hours) : t("unavailable") }))} />
      </div></section>
    </div>
    <section data-statistics-reveal="2" id="stats-calendar-people" className={panel}><Title title={t("calendarPeopleTitle")} info={t("calendarPeopleDefinition")} />
      <p className="px-5 py-3 text-xs text-[var(--ui-text-muted)]">{t("participantCountNote")}{report.unassignedCount ? <span className="mt-1 block">{t("unassignedEvents", { count: report.unassignedCount })}</span> : null}</p>
      {report.people.length ? <div className="overflow-x-auto border-t border-[var(--ui-border)]" role="region" aria-label={t("calendarPeopleTitle")} tabIndex={0}><table className={tableClass}><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"><tr><th scope="col" className="sticky left-0 z-20 min-w-40 bg-[var(--ui-surface-subtle)]">{t("employee")}</th><th scope="col">{t("eventParticipations")}</th><th scope="col" className="min-w-44">{t("scheduledParticipantHours")}</th><th scope="col">{t("timeCoverage")}</th></tr></thead><tbody>{report.people.map(person => <tr key={person.id} className="border-t border-[var(--ui-border)] text-[var(--ui-text-secondary)]"><th scope="row" className="sticky left-0 z-10 bg-[var(--ui-surface)] font-medium text-[var(--ui-text)]"><Link href={`/team/${person.id}`} className="flex items-center gap-2.5 rounded hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><UserAvatar name={person.name || t("formerEmployee")} size="boardCard" decorative /><span className="min-w-0"><span className="block">{person.name || t("formerEmployee")}</span>{!person.active ? <span className="mt-0.5 block text-[10px] font-normal text-[var(--ui-text-muted)]">{t("inactiveEmployee")}</span> : null}</span></Link></th><td className="tabular-nums">{number(person.count)}</td><td className="tabular-nums">{person.timedCount ? hours(person.hours) : "—"}{person.timedCount ? <span aria-hidden="true" className="mt-2 block h-1 max-w-32 rounded bg-[var(--ui-surface-muted)]"><span className="block h-full rounded bg-[var(--ui-text-secondary)]" style={{ width: `${person.hours / Math.max(1, ...report.people.map(row => row.hours)) * 100}%` }} /></span> : null}</td><td className="text-[var(--ui-text-muted)]">{t("participantTimeCoverage", { timed: person.timedCount, total: person.count })}{person.unknownDurationCount ? <span className="mt-1 block text-[var(--ui-warning-text)]">{t("unknownDurations", { count: person.unknownDurationCount })}</span> : null}</td></tr>)}</tbody></table></div> : <p className="px-5 pb-4 text-xs text-[var(--ui-text-muted)]">{t("noCalendarPeople")}</p>}
    </section>
    <section data-statistics-reveal="3" id="stats-calendar-projects" className={panel}><Title title={t("projectEventTitle")} info={t("projectEventDefinition")} /><div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 lg:grid-cols-4 [&>div>p:first-child]:min-h-10"><Value label={t("linkedEvents")} value={number(report.projectLinked.count)} hint={report.projectLinked.timedCount ? hours(report.projectLinked.hours) : t("noTimedEvents")} /><Value label={t("eventsPerProject")} value={number(report.projectAverages.count)} hint={t("projectDenominator", { count: report.projectAverages.projectCount })} /><Value label={t("hoursPerProject")} value={number(report.projectAverages.hours)} unit={t("hoursShort")} /><Value label={t("unlinkedEvents")} value={number(report.unlinked.count)} hint={report.unlinked.timedCount ? hours(report.unlinked.hours) : t("noTimedEvents")} /></div>
      {report.projects.length ? <details data-statistics-projects className="group border-t border-[var(--ui-border)] text-xs text-[var(--ui-text-secondary)]"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 bg-[var(--ui-surface-subtle)] px-5 py-3 text-sm font-medium transition-colors duration-[180ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)] [&::-webkit-details-marker]:hidden"><span>{t("projectEventDetails")}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" /></summary><div className="overflow-x-auto px-1 py-2 sm:px-5"><table className={tableClass}><thead><tr><th scope="col">{t("project")}</th><th scope="col">{t("eventsUnit")}</th><th scope="col">{t("measurableHours")}</th><th scope="col">{t("calendarDaysShort")}</th></tr></thead><tbody>{report.projects.map(project => <tr key={project.id} className="border-t border-[var(--ui-border)]"><th scope="row" className="font-normal">{project.name ? <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link> : t("unavailableProject")}</th><td>{number(project.count)}</td><td>{project.timedCount ? hours(project.hours) : "—"}</td><td>{number(project.allDayDays)}</td></tr>)}</tbody></table></div></details> : null}
    </section>
  </div>;
}
