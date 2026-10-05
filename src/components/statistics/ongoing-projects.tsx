"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { StatisticsMetric } from "./statistics-card";
import type { StatisticsReport } from "@/lib/statistics";

export function OngoingProjects({ projects, today, totalCount, pausedCount, medianAge, activeMedianAge }: {
  projects: StatisticsReport["ongoing"];
  today: string;
  totalCount: number;
  pausedCount: number;
  medianAge: number | null;
  activeMedianAge: number | null;
}) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const [includePaused, setIncludePaused] = useState(true);
  const visibleProjects = includePaused ? projects : projects.filter(project => project.status !== "paused");
  const visibleTotal = includePaused ? totalCount : totalCount - pausedCount;
  const age = includePaused ? medianAge : activeMedianAge;
  const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  const maximum = Math.max(1, visibleProjects[0]?.days ?? 0);
  const row = (project: StatisticsReport["ongoing"][number]) => <li key={project.id}>
    <Link href={`/projects/${project.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-[var(--ui-radius-control)] px-3 py-2.5 transition-colors duration-[180ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)]">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium leading-5 text-[var(--ui-text-secondary)] group-hover:text-[var(--ui-text)]" title={project.name}>{project.name}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[var(--ui-text-muted)]">{t("recordedStart", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(project.started)) })}{project.status === "paused" ? ` · ${t("pausedProject")}` : ""}</span>
      </span>
      <span className="whitespace-nowrap text-right text-xs font-medium leading-5 tabular-nums text-[var(--ui-text)]">{new Intl.NumberFormat(locale).format(project.days)} <span className="font-normal text-[var(--ui-text-muted)]">{t("days")}</span></span>
      <span aria-hidden="true" className="col-span-2 block h-1 overflow-hidden rounded bg-[var(--ui-surface-muted)]"><span data-statistics-progress className="block h-full rounded bg-[var(--ui-text-secondary)]" style={{ width: `${project.days / maximum * 100}%` }} /></span>
    </Link>
  </li>;

  return <div id="stats-ongoing" className="flex min-w-0 flex-col">
    <StatisticsMetric className="p-5" context={t("ongoingAsOf", { date: date(today) })} label={t("medianAge")} value={number(age)} unit={t("days")} hint={t("ongoingCoverageShort", { count: visibleProjects.length, total: visibleTotal })} info={<>
      <p>{t("ongoingDefinition")}</p>
      <p>{t("ongoingCoverage", { count: visibleProjects.length, total: visibleTotal })}</p>
      {visibleProjects.length < visibleTotal ? <p>{t("ongoingHistoryGap", { count: visibleTotal - visibleProjects.length })}</p> : null}
    </>} />
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium text-[var(--ui-text)]">{t("longestRunning")}</h3>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-[var(--ui-text-secondary)]">
          <input type="checkbox" checked={includePaused} onChange={event => setIncludePaused(event.target.checked)} className="size-4 shrink-0 accent-[var(--ui-action-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]" />
          {t("includePausedProjects")}
        </label>
      </div>
      {visibleProjects.length ? <div className="relative overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-1.5 lg:min-h-72 lg:flex-1">
        <ol aria-label={t("longestRunning")} tabIndex={0} className="max-h-96 overflow-y-auto overscroll-y-contain rounded-[calc(var(--ui-radius-control)-4px)] pr-1 [scrollbar-gutter:stable] [scrollbar-color:var(--ui-border-strong)_var(--ui-surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)] lg:absolute lg:inset-1.5 lg:max-h-none">{visibleProjects.map(row)}</ol>
      </div> : <p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("noOngoingHistory")}</p>}
    </div>
  </div>;
}
