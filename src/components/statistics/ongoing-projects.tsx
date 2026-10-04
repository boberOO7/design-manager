import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { StatisticsReport } from "@/lib/statistics";

export async function OngoingProjects({ projects }: { projects: StatisticsReport["ongoing"] }) {
  const [t, locale] = await Promise.all([getTranslations("Statistics"), getLocale()]);
  const maximum = Math.max(1, projects[0]?.days ?? 0);
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

  return <div className="overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-1.5">
    <ol aria-label={t("longestRunning")} tabIndex={0} className="max-h-72 overflow-y-auto overscroll-y-contain rounded-[calc(var(--ui-radius-control)-4px)] pr-1 [scrollbar-gutter:stable] [scrollbar-color:var(--ui-border-strong)_var(--ui-surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)]">{projects.map(row)}</ol>
  </div>;
}
