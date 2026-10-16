"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, LayoutGrid, List } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatStatisticsDuration } from "@/lib/statistics";
import type { buildWorkStatistics } from "@/lib/work-log";
import { StatisticsInfo } from "./statistics-info";

const workSeries = [
  { key: "taskMinutes", label: "loggedTaskHours", color: "var(--ui-text-secondary)" },
  { key: "reviewMinutes", label: "loggedReviewHours", color: "var(--ui-success-text)" },
  { key: "internalMinutes", label: "loggedInternalHours", color: "var(--ui-info-text)" },
] as const;

function WorkTimeRow({ name, href, avatar, inactive, totalMinutes, maximum, children, segments, layout }: {
  name: string; href?: string; avatar?: boolean; inactive?: boolean; totalMinutes: number; maximum: number;
  children: ReactNode; segments: { key: string; minutes: number; color: string }[]; layout: "list" | "grid";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const t = useTranslations("Statistics");
  return <li className="@container min-w-0 border-t border-[var(--ui-border-subtle)]">
    <button id={`${id}-trigger`} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className={`grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-2 px-5 py-2 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none ${layout === "grid" ? "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_1rem] @xl:gap-x-4" : ""}`}>
      <span className="flex min-w-0 items-center gap-2.5">
        {avatar ? <UserAvatar name={name} size="boardCard" decorative /> : null}
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--ui-text)]" title={name}>{name}</span>
          {inactive ? <span className="mt-0.5 block text-[10px] text-[var(--ui-text-muted)]">{t("inactiveEmployee")}</span> : null}
        </span>
      </span>
      <span aria-hidden="true" className={`col-span-3 row-start-2 w-full overflow-hidden rounded bg-[var(--ui-surface-muted)] ${layout === "grid" ? "h-1.5 max-w-lg @xl:col-span-1 @xl:col-start-2 @xl:row-start-1" : "h-2"}`}>
        <span data-statistics-progress className="flex h-full overflow-hidden rounded" style={{ width: `${totalMinutes / maximum * 100}%`, minWidth: totalMinutes ? 2 : 0 }}>
          {segments.map(segment => <span key={segment.key} data-segment={segment.key} className="h-full" style={{ width: `${totalMinutes ? segment.minutes / totalMinutes * 100 : 0}%`, backgroundColor: segment.color }} />)}
        </span>
      </span>
      <span data-work-total className={`whitespace-nowrap text-right text-sm font-semibold tabular-nums ${totalMinutes ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}>{formatStatisticsDuration(totalMinutes / 60)} <span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("durationUnit")}</span></span>
      <ChevronDown aria-hidden="true" className={`size-4 text-[var(--ui-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    <AnimatedFormContent id={id} labelledBy={`${id}-trigger`} isOpen={open}>
      <div className="space-y-3 bg-[var(--ui-surface-subtle)] px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs @xl:grid-cols-3 @4xl:grid-cols-5">{children}</dl>
        {href ? <Link href={href} className="inline-flex max-w-full items-center gap-1 rounded text-xs font-medium text-[var(--ui-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"><span className="truncate">{name}</span><ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" /></Link> : null}
      </div>
    </AnimatedFormContent>
  </li>;
}

export function WorkTimeReports({ report, monthlyChart }: { report: ReturnType<typeof buildWorkStatistics>; monthlyChart: ReactNode }) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const [view, setView] = useState<"employees" | "projects">("employees");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const projectSeries = [workSeries[0], workSeries[1]];
  const maximum = Math.max(1, ...(view === "employees" ? report.employees : report.projects).map(row => row.totalMinutes));
  const metric = (label: string, value: string, amount: number, color = "var(--ui-text)") => <div key={label}><dt className="leading-5 text-[var(--ui-text-secondary)]">{label}</dt><dd data-work-metric className="mt-1 font-semibold tabular-nums" style={{ color: amount ? color : "var(--ui-text-muted)" }}>{value}</dd></div>;
  const hours = (minutes: number) => formatStatisticsDuration(minutes / 60);
  const count = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  return <>
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ui-border)] px-5 py-3">
      <SegmentedControl ariaLabel={t("workTitle")} value={view} onValueChange={setView} className="max-w-full"
        items={[{ value: "employees", label: t("workByEmployees") }, { value: "projects", label: t("workByProjects") }]} />
      <div role="group" aria-label={t("workLayout")} className="inline-flex shrink-0 gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">
        {([{ value: "list", label: t("workLayoutList"), icon: List }, { value: "grid", label: t("workLayoutGrid"), icon: LayoutGrid }] as const).map(({ value, label, icon: Icon }) => <Tooltip key={value} content={label}>
          <Button type="button" variant="ghost" size="compact" aria-label={label} aria-pressed={layout === value} onClick={() => setLayout(value)}
            className={`size-9 p-0 ${layout === value ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-panel)] hover:bg-[var(--ui-surface)]" : ""}`}>
            <Icon aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>)}
      </div>
      {view === "projects" ? <div className="ml-auto"><StatisticsInfo label={t("projectWorkTitle")}>{t("projectWorkDefinition")}</StatisticsInfo></div> : null}
    </div>
    <div id={view === "employees" ? "stats-work-people" : "stats-work-projects"} role="region" aria-label={t(view === "employees" ? "workByEmployees" : "workByProjects")}>
      <ul key={view} className={`grid items-start ${layout === "grid" ? "lg:grid-cols-2 lg:gap-x-5" : "grid-cols-1"}`}>
        {view === "employees" ? report.employees.map(person => <WorkTimeRow key={person.id} layout={layout} name={person.name || t("formerEmployee")} href={`/team/${person.id}`} avatar inactive={!person.active}
          totalMinutes={person.totalMinutes} maximum={maximum} segments={workSeries.map(item => ({ key: item.key, minutes: person[item.key], color: item.color }))}>
          {workSeries.map(item => metric(t(item.label), hours(person[item.key]), person[item.key], item.color))}
          {metric(t("reviewsCompleted"), count(person.reviewsCompleted), person.reviewsCompleted)}
          {metric(t("reviewSessionsCompleted"), count(person.reviewSessionsCompleted), person.reviewSessionsCompleted)}
        </WorkTimeRow>) : report.projects.map(project => <WorkTimeRow key={project.id ?? "unavailable"} layout={layout} name={project.id && project.name ? project.name : t("unavailableProject")}
          href={project.id && project.name ? `/projects/${project.id}` : undefined} totalMinutes={project.totalMinutes} maximum={maximum}
          segments={projectSeries.map(item => ({ key: item.key, minutes: project[item.key], color: item.color }))}>
          {projectSeries.map(item => metric(t(item.label), hours(project[item.key]), project[item.key], item.color))}
        </WorkTimeRow>)}
      </ul>
      {view === "projects" && !report.projects.length ? <p className="px-5 pb-4 text-xs text-[var(--ui-text-muted)]">{t("noProjectWorkTime")}</p> : null}
    </div>
    <AnimatedDisclosure title={t("workMonthlyTrend")} className="border-t border-[var(--ui-border)] px-5 py-1">
      <div id="stats-work-months" className="pb-4 pt-2">{monthlyChart}</div>
    </AnimatedDisclosure>
  </>;
}
