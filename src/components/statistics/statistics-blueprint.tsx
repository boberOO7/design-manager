import { useTranslations } from "next-intl";
import { statisticsPanel } from "./statistics-card";

function MetricInk({ label, hint = false }: { label: string; hint?: boolean }) {
  return <div className="min-w-0 p-5"><p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{label}</p><span className="instaload-mark mt-1 h-9 w-24" />{hint ? <span className="mt-1 flex h-5 items-center"><span className="instaload-mark h-3 w-32" /></span> : null}</div>;
}
function PlotInk({ compact = false }: { compact?: boolean }) {
  return <div aria-hidden="true"><span className="instaload-mark mb-1 h-4 w-32" /><div className={`relative border-b border-[var(--ui-border)] ${compact ? "h-[130px]" : "h-[212px]"}`}>
    <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-[var(--ui-border-subtle)]" /><div className="absolute inset-x-0 top-2/3 border-t border-dashed border-[var(--ui-border-subtle)]" />
    <div className="absolute inset-x-8 bottom-8 top-5 flex items-end gap-3">{[38, 55, 42, 68, 52, 78].map((height, i) => <span key={i} className="instaload-mark flex-1" style={{ height: `${height}%` }} />)}</div>
  </div></div>;
}
function TableInk({ rows = 5 }: { rows?: number }) {
  return <div aria-hidden="true" className="divide-y divide-[var(--ui-border)]"><div className="flex gap-5 bg-[var(--ui-surface-subtle)] px-5 py-3">{[0, 1, 2, 3].map(i => <span key={i} className="instaload-mark h-4 flex-1" />)}</div>{Array.from({ length: rows }, (_, i) => <div key={i} className="flex min-h-12 items-center gap-5 px-5 py-3">{[0, 1, 2, 3].map(n => <span key={n} className="instaload-mark h-3 flex-1" />)}</div>)}</div>;
}
function PanelInk({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const t = useTranslations("Statistics");
  return <section role="status" aria-label={t("loading")} className={`${statisticsPanel} instaload-blueprint ${className}`}>
    <span className="sr-only">{t("loading")}</span><div className="flex min-h-[61px] items-center border-b border-[var(--ui-border)] px-5 py-3"><h2 className="text-base font-semibold leading-6 text-[var(--ui-text)]">{title}</h2></div><div aria-hidden="true">{children}</div>
  </section>;
}

export function StatisticsOverviewBlueprint({ kind }: { kind: "production" | "credits" | "duration" }) {
  const t = useTranslations("Statistics");
  return <PanelInk title={t(kind === "production" ? "productionTitle" : kind === "credits" ? "creditsTitle" : "durationTitle")} className={kind === "duration" ? "min-h-[47rem]" : "statistics-overview-panel"}>
    {kind === "production" ? <><div className="grid grid-cols-2 divide-x divide-[var(--ui-border)] border-b border-[var(--ui-border)]"><MetricInk label={t("completedProjects")} hint /><MetricInk label={t("physicalArea")} hint /></div><div className="grid gap-4 p-5 lg:grid-cols-2"><PlotInk /><PlotInk /></div></>
      : kind === "credits" ? <><MetricInk label={t("creditedArea")} hint /><div className="px-5 pb-5"><PlotInk compact /><div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--ui-border)] pt-4"><span className="instaload-mark h-10 w-20" /><span className="instaload-mark h-10 w-20" /></div></div></>
        : <div className="grid divide-y divide-[var(--ui-border)] lg:grid-cols-2 lg:divide-x lg:divide-y-0"><div><MetricInk label={t("medianDuration")} hint /><div className="space-y-4 px-5 pb-5"><div className="grid grid-cols-2 gap-2"><span className="instaload-mark h-24" /><span className="instaload-mark h-24" /></div><TableInk rows={3} /><PlotInk compact /></div></div><div><MetricInk label={t("medianAge")} hint /><div className="space-y-3 px-5 pb-5"><span className="instaload-mark h-11 w-3/4" /><TableInk rows={6} /></div></div></div>}
  </PanelInk>;
}

export function StatisticsSectionBlueprint({ section }: { section: "leads" | "work" | "attendance" | "calendar" }) {
  const t = useTranslations("Statistics");
  if (section === "attendance") return <PanelInk title={t("teamTitle")}><TableInk rows={8} /></PanelInk>;
  if (section === "work") return <PanelInk title={t("workTitle")}><div className="flex flex-wrap">{["taskWork", "reviewWork", "internalWork", "trackedWorkTime", "reviewsCompleted", "reviewSessionsCompleted"].map(key => <MetricInk key={key} label={t(key)} />)}</div><div className="p-5"><PlotInk /></div><TableInk /></PanelInk>;
  if (section === "leads") return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="space-y-4"><PanelInk title={t("leadsTitle")}><MetricInk label={t("newLeads")} /><div className="px-5 pb-5"><PlotInk compact /></div></PanelInk><PanelInk title={t("leadTimingTitle")}><TableInk /></PanelInk></div><div className="space-y-4"><PanelInk title={t("cohortOutcomes")}><MetricInk label={t("cohortSuccess")} hint /><div className="space-y-5 p-5">{[0, 1, 2, 3].map(i => <span key={i} className="instaload-mark h-7 w-full" />)}</div></PanelInk><PanelInk title={t("leadSources")}><TableInk rows={2} /></PanelInk></div></div>;
  return <div className="space-y-4"><div className="grid gap-4 xl:grid-cols-2"><PanelInk title={t("calendarTitle")}><div className="grid grid-cols-3"><MetricInk label={t("elapsedEvents")} /><MetricInk label={t("measurableHours")} /><MetricInk label={t("averageDuration")} /></div><div className="space-y-5 p-5">{[0, 1, 2, 3, 4].map(i => <span key={i} className="instaload-mark h-9 w-full" />)}</div></PanelInk><PanelInk title={t("eventsByMonth")}><div className="space-y-5 p-5"><PlotInk /><PlotInk compact /></div></PanelInk></div><PanelInk title={t("calendarPeopleTitle")}><TableInk rows={8} /></PanelInk><PanelInk title={t("projectEventTitle")}><TableInk rows={2} /></PanelInk></div>;
}
