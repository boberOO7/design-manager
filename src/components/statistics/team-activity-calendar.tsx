"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatStatisticsDuration } from "@/lib/statistics";
import { getTeamActivityDayState, groupTeamActivityItems, shiftActivityMonth, teamActivityReportSchema, type TeamActivityDay, type TeamActivityDayState, type TeamActivityReport } from "@/lib/team-activity";
import { statisticsPanel } from "./statistics-card";
import { StatisticsInfo } from "./statistics-info";

const dayStateClasses: Record<TeamActivityDayState, string> = {
  missing: "bg-[var(--ui-surface-muted)]",
  under: "bg-[var(--ui-warning-accent)]",
  target: "bg-[var(--ui-activity-target)]",
  over: "bg-[var(--ui-activity-over)]",
  excused: "border border-[var(--ui-border-strong)] bg-transparent",
  worked: "bg-[var(--ui-violet-border)]",
};

const activityCategories = [
  { kind: "task", label: "taskWork", color: "var(--ui-text-secondary)" },
  { kind: "review", label: "reviewWork", color: "var(--ui-info-text)" },
  { kind: "internal", label: "internalWork", color: "color-mix(in srgb, var(--ui-violet-text) 75%, var(--ui-text-secondary))" },
  { kind: "calendar", label: "activityCalendar", color: "var(--ui-success-text)" },
] as const;

function ActivityMark({ state, kind, small = false }: { state: TeamActivityDayState; kind?: TeamActivityDay["kind"]; small?: boolean }) {
  const appearance = state === "excused" && kind === "time_off"
    ? "border border-dashed border-[var(--ui-text-subtle)] bg-[var(--ui-surface-muted)]"
    : dayStateClasses[state];
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] ${small ? "size-3" : "size-5 2xl:size-7"} ${appearance}`} />;
}

export function TeamActivityCalendar({ today }: { today: string }) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [report, setReport] = useState<TeamActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = report?.month === month ? report : null;
  const currentMonth = (report?.today ?? today).slice(0, 7);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load(initial = false) {
      if (inFlight) return;
      inFlight = true;
      if (initial) setLoading(true);
      try {
        const response = await fetch(`/api/statistics/team-activity?month=${month}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load team activity");
        const next = teamActivityReportSchema.parse(await response.json());
        if (!controller.signal.aborted) { setReport(next); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    // Match the existing active review timer's cadence, only for the current month.
    const interval = month === currentMonth ? window.setInterval(refresh, 15_000) : undefined;
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [month, retry, currentMonth]);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  return <section id="stats-team-activity" aria-labelledby="stats-team-activity-title" className={statisticsPanel}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--ui-border)] px-4 py-3">
      <h2 id="stats-team-activity-title" className="flex items-center gap-1 text-base font-semibold text-[var(--ui-text)]">
        {t("activityTitle")}<StatisticsInfo label={t("activityTitle")}><p>{t("activityDefinition")}</p></StatisticsInfo>
      </h2>
      <nav aria-label={t("activityMonthNavigation")} className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={t("activityPreviousMonth")} onClick={() => setMonth(shiftActivityMonth(month, -1))}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
        <span data-testid="activity-month" aria-live="polite" className="min-w-36 text-center text-xs font-medium capitalize text-[var(--ui-text)]">{monthLabel}</span>
        <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={t("activityNextMonth")} onClick={() => setMonth(shiftActivityMonth(month, 1))}><ChevronRight className="size-4" aria-hidden="true" /></Button>
        <Button variant="outline" size="sm" className="ml-1 text-xs" onClick={() => setMonth(currentMonth)}>{t("activityToday")}</Button>
      </nav>
    </div>
    {failed ? <div role="alert" className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-[var(--ui-danger-text)]"><span>{t("activityLoadFailed")}</span><Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>{t("activityRetry")}</Button></div> : null}
    <div aria-busy={loading} className="relative">
      {!current ? <p role="status" className={`${report ? "absolute inset-0" : ""} px-4 py-8 text-xs text-[var(--ui-text-muted)]`}>{loading ? t("activityLoading") : t("activityNoData")}</p> : null}
      {report ? <div className={current ? "" : "invisible"} aria-hidden={!current}>
        {report.people.length ? <ActivityGrid report={report} liveAvailable={!failed && !!current} />
          : <p className="px-4 py-8 text-xs text-[var(--ui-text-muted)]">{t("activityNoPeople")}</p>}
      </div> : null}
    </div>
    {report ? <div data-testid="activity-legend" className={`${current ? "" : "invisible"} flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--ui-border)] px-4 py-3 text-[11px] text-[var(--ui-text-muted)]`} aria-hidden={!current}>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="missing" small />{t("activityMissing")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="under" small />{t("activityState_under")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="target" small />{t("activityState_target")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="over" small />{t("activityState_over")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="worked" small />{t("activityState_worked")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="excused" kind="weekend" small />{t("activityDay_weekend")}</span>
      <span className="inline-flex items-center gap-1.5"><ActivityMark state="excused" kind="time_off" small />{t("activityDay_time_off")}</span>
      <span className="sm:ml-auto">{t("activityTimezone")}</span>
    </div> : null}
  </section>;
}

function ActivityGrid({ report, liveAvailable }: { report: TeamActivityReport; liveAvailable: boolean }) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const dates = report.people[0].days.map(day => day.date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  return <div className="overflow-x-auto px-4 pb-3 [scrollbar-gutter:stable]" data-testid="activity-scroll">
    <table className="w-full table-fixed border-separate border-spacing-0 text-xs" style={{ minWidth: `${208 + dates.length * 28}px` }} aria-label={t("activityTitle")}>
      <thead><tr>
        <th scope="col" className="sticky left-0 z-20 w-52 bg-[var(--ui-surface)] py-3 pr-3 text-left text-[11px] font-medium text-[var(--ui-text-muted)]">{t("employee")}</th>
        {dates.map((date, index) => <th key={date} scope="col" data-weekend={report.people[0].days[index].weekend} aria-current={date === report.today ? "date" : undefined} className="pb-2 pt-3 text-center font-normal tabular-nums text-[var(--ui-text-muted)] data-[weekend=true]:bg-[var(--ui-surface-subtle)] aria-[current=date]:font-semibold aria-[current=date]:text-[var(--ui-info-text)]">
          <span className="block text-[10px]">{weekday.format(new Date(date))}</span><span className="mt-0.5 block text-[11px]">{Number(date.slice(8))}</span>
        </th>)}
      </tr></thead>
      <tbody>{report.people.map(person => <tr key={person.id}>
        <th scope="row" className="sticky left-0 z-10 bg-[var(--ui-surface)] py-1 pr-3 text-left font-medium text-[var(--ui-text-secondary)]">
          <Tooltip content={person.name}><Link href={`/team/${person.id}`} className="flex min-w-0 items-center gap-2.5 rounded py-1 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">
            <UserAvatar imageUrl={person.avatarUrl} name={person.name || t("formerEmployee")} size="boardCard" decorative /><span className="min-w-0 truncate">{person.name || t("formerEmployee")}</span>
          </Link></Tooltip>
        </th>
        {person.days.map(day => <td key={day.date} className={`p-0 text-center ${day.weekend ? "bg-[var(--ui-surface-subtle)]" : ""}`}><ActivityCell day={day} name={person.name || t("formerEmployee")} workday={report.workdayMinutes} liveAvailable={liveAvailable} /></td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

function ActivityCell({ day, name, workday, liveAvailable }: { day: TeamActivityDay; name: string; workday: number; liveAvailable: boolean }) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(day.date));
  const total = day.recorded ? t("activityHours", { hours: formatStatisticsDuration(day.minutes / 60) }) : t("activityMissing");
  const state = getTeamActivityDayState(day, workday);
  const context = [day.kind !== "day" ? t(`activityDay_${day.kind}`) : null,
    day.weekend && day.kind !== "weekend" ? t("activityDay_weekend") : null, t(`activityState_${state}`)].filter(Boolean).join(" · ");
  const target = day.kind === "day" ? t("activityTarget", { hours: formatStatisticsDuration(workday / 60) }) : t("activityNoTarget");
  const running = liveAvailable && day.runningTasks.length > 0;
  const summary = <div className="-mr-2.5 max-h-[min(60dvh,24rem)] overflow-y-auto overscroll-contain pr-2.5 [scrollbar-gutter:stable]"><p className="font-semibold">{name} · {date}</p><p className="tabular-nums">{total}</p><p>{context}</p><p className="text-[var(--ui-text-muted)]">{target}</p><DailyBreakdown day={day} liveAvailable={liveAvailable} /></div>;
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Tooltip content={open ? null : summary} interactive contentClassName="w-[30rem] max-w-[min(30rem,var(--radix-tooltip-content-available-width))]"><Popover.Trigger asChild>
      <button type="button" data-activity-date={day.date} data-recorded={day.recorded} data-activity-state={state} data-day-kind={day.kind} data-weekend={day.weekend} aria-label={`${name}, ${date}: ${total} · ${context}${running ? ` · ${t("activityRunning")}` : ""}`}
        className="relative inline-flex size-7 items-center justify-center rounded transition-transform duration-[140ms] ease-[ease-out] hover:z-30 motion-safe:hover:[transform:scale(1.1)] focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none 2xl:size-9">
        <ActivityMark state={state} kind={day.kind} />
        {running ? <span data-testid="activity-running" aria-hidden="true" className="absolute right-0.5 top-0.5 size-2 rounded-full border border-[var(--ui-surface)] bg-[var(--ui-info-text)]" /> : null}
      </button>
    </Popover.Trigger></Tooltip>
    <Popover.Portal><Popover.Content aria-label={`${name} · ${date}`} sideOffset={6} collisionPadding={12}
      className="ui-tooltip z-[80] max-h-[min(70dvh,28rem,var(--radix-popover-content-available-height))] w-[30rem] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-xs leading-5 text-[var(--ui-text-secondary)] shadow-[var(--ui-shadow-popover)]">
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[var(--ui-text)]">{name}</p><p>{date}</p></div><Popover.Close aria-label={t("closeInfo")} className="rounded p-1 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><X className="size-4" aria-hidden="true" /></Popover.Close></div>
      <p className="mt-2 font-semibold tabular-nums text-[var(--ui-text)]">{total}</p><p>{context}</p><p className="text-[var(--ui-text-muted)]">{target}</p><DailyBreakdown day={day} liveAvailable={liveAvailable} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function DailyBreakdown({ day, liveAvailable }: { day: TeamActivityDay; liveAvailable: boolean }) {
  const t = useTranslations("Statistics");
  let reviewNumber = 0;
  return <>
    {activityCategories.map(category => {
      const items = day.items.filter(item => item.activityKind === category.kind);
      if (!items.length) return null;
      const groups = groupTeamActivityItems(items);
      const itemMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
      const minutes = category.kind === "calendar" ? day.minutes - day.items.filter(item => item.activityKind !== "calendar").reduce((sum, item) => sum + item.minutes, 0) : itemMinutes;
      return <section key={category.kind} aria-label={t(category.label)} data-activity-category={category.kind} className="mt-3 border-t border-[var(--ui-border)] pt-2">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 text-[11px] font-semibold" style={{ color: category.color }}>
          <h3 className="flex min-w-0 items-center gap-1.5 text-[var(--ui-text-secondary)]"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />{t(category.label)}</h3>
          <span data-activity-duration className="min-w-[5ch] whitespace-nowrap text-right tabular-nums">{formatStatisticsDuration(minutes / 60)}</span>
        </div>
        {category.kind === "calendar" && itemMinutes > minutes + 0.001 ? <p className="mb-2 text-[var(--ui-text-muted)]">{t("activityCalendarOverlap")}</p> : null}
        <ul className="space-y-2">{groups.map((group, index) => {
          if (!group.reviewSessionId) return <li key={index}><ActivityEntry item={group.items[0]} date={day.date} /></li>;
          const projects = [...new Map(group.items.map(item => [item.task?.project_id ?? null, item.task?.project?.name ?? t("unavailableProject")])).values()];
          const taskCount = new Set(group.items.map(item => item.task?.id ?? item.reviewRoundId)).size;
          return <li key={group.reviewSessionId}><details className="group/review" data-review-session={group.reviewSessionId}>
            <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-start gap-1.5 text-[var(--ui-text-secondary)]"><ChevronDown aria-hidden="true" className="mt-1 size-3 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-[180ms] group-open/review:rotate-180 motion-reduce:transition-none" /><span className="min-w-0 break-words font-medium">{t("activityReviewSession", { number: ++reviewNumber })} · {projects.join(" · ")}</span></span>
              <span data-activity-duration className="min-w-[5ch] whitespace-nowrap text-right tabular-nums">{formatStatisticsDuration(group.minutes / 60)}</span>
              <span className="col-start-1 pl-[18px] text-[var(--ui-text-muted)]">{t("activityReviewTasks", { count: taskCount })}</span>
            </summary>
            <ul className="mt-2 space-y-2 pl-[18px]">{group.items.map((item, taskIndex) => <li key={taskIndex}><ActivityEntry item={item} date={day.date} showProject={projects.length > 1} /></li>)}</ul>
          </details></li>;
        })}</ul>
      </section>;
    })}
    {liveAvailable ? day.runningTasks.map(task => <p key={task.id} className="mt-2 text-[var(--ui-info-text)]">{t("activityRunning")}: {task.title} · {task.project?.name ?? t("unavailableProject")}</p>) : null}
  </>;
}

function ActivityEntry({ item, date, showProject = true }: { item: TeamActivityDay["items"][number]; date: string; showProject?: boolean }) {
  const t = useTranslations("Statistics");
  if (item.activityKind === "calendar") {
    const event = item.calendarEvent;
    return <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"><span className="min-w-0 break-words text-[var(--ui-text-secondary)]">{event
        ? <Link className="rounded underline decoration-[var(--ui-border-strong)] underline-offset-2 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]" href={`/calendar?date=${date}&event=${event.id}`}>{event.title}</Link>
        : t("activityCalendar")}</span><span data-activity-duration className="min-w-[5ch] whitespace-nowrap text-right tabular-nums">{formatStatisticsDuration(item.minutes / 60)}</span></div>
      {showProject && event ? <p className="break-words text-[var(--ui-text-muted)]">{event.project?.name ?? t("activityNoProject")}</p> : null}
    </>;
  }
  return <>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"><span className="min-w-0 break-words text-[var(--ui-text-secondary)]">{item.activityKind === "internal" ? t("activityInternalWalkthrough")
      : item.task ? <Link className="rounded underline decoration-[var(--ui-border-strong)] underline-offset-2 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]" href={`/projects/${item.task.project_id}?task=${item.task.id}`}>{item.task.title}</Link> : t("activityUnavailableTask")}</span><span data-activity-duration className="min-w-[5ch] whitespace-nowrap text-right tabular-nums">{formatStatisticsDuration(item.minutes / 60)}</span></div>
    {showProject && item.activityKind !== "internal" ? <p className="break-words text-[var(--ui-text-muted)]">{item.task?.project?.name ?? t("unavailableProject")}</p> : null}
  </>;
}
