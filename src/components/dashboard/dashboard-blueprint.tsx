import { useTranslations } from "next-intl";
import { DashboardSection, MetricPanel } from "./dashboard-patterns";
import type { DashboardMetric } from "@/lib/dashboard-presentation";

export function MetricBlueprint({ labelKey }: { labelKey: DashboardMetric["labelKey"] }) {
  const t = useTranslations("Dashboard");
  return <div aria-busy="true" className="dashboard-metric-cell dashboard-blueprint">
    <p className="text-xs font-medium leading-4 text-[var(--ui-text-muted)]">{t(labelKey)}</p>
    <div aria-hidden="true" className="mt-auto flex h-9 items-end gap-1.5 pt-2"><span className="blueprint-mark h-5 w-8" /><span className="blueprint-mark h-5 w-5" /></div>
  </div>;
}

export function BlueprintRows({ kind = "list", rows = 3 }: { kind?: "attention" | "workload" | "list" | "tasks" | "projects"; rows?: number }) {
  return <div aria-busy="true" className={`dashboard-blueprint blueprint-rows blueprint-rows--${kind}`}>
    <div aria-hidden="true" className={kind === "attention" ? (rows === 1 ? "grid" : "grid sm:grid-cols-2 xl:grid-cols-3") : kind === "tasks" ? "space-y-px" : "space-y-1"}>
      {Array.from({ length: rows }, (_, index) => <div key={index} className={`blueprint-row blueprint-row--${kind}`}>
        <span className={`blueprint-mark shrink-0 ${kind === "tasks" ? "size-4 rounded" : "size-8 rounded-full"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-2"><span className={`blueprint-mark h-2.5 ${index % 3 === 0 ? "w-3/4" : index % 3 === 1 ? "w-1/2" : "w-2/3"}`} /><span className="blueprint-mark h-1.5 w-1/3" /></span>
        {kind === "workload" ? <span className="blueprint-workload-metrics">{Array.from({length:6},(_,i)=><span key={i} className="blueprint-mark h-3 w-7" />)}</span> : kind !== "attention" ? <span className="blueprint-mark h-2 w-12 shrink-0" /> : null}
      </div>)}
    </div>
  </div>;
}

export function DashboardBlueprint({ employee = false }: { employee?: boolean }) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const metrics: DashboardMetric["labelKey"][] = employee
    ? ["metricInProgress", "metricInReview", "metricOverdueTasks", "metricCompletedMonth", "metricProductivity", "metricVacationBalance"]
    : ["metricActiveProjects", "metricOpenTasks", "metricOverdueTasks", "metricActiveLeads", "metricExpectedInflow", "metricProfitLoss"];
  return <div className="space-y-5" data-dashboard-shell="blueprint">
    <p role="status" className="sr-only">{common("loading")}</p>
    <section className="space-y-3"><h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1><MetricPanel>{metrics.map(labelKey=><MetricBlueprint key={labelKey} labelKey={labelKey}/>)}</MetricPanel></section>
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="grid min-w-0 content-start gap-4 xl:col-span-7">
        <DashboardSection className="dashboard-attention" title={t("needsAttention")}><BlueprintRows kind="attention" rows={6} /></DashboardSection>
        <DashboardSection flushContent={!employee} title={t(employee ? "myWork" : "teamWorkload")}><BlueprintRows kind={employee ? "tasks" : "workload"} rows={employee ? 3 : 10} /></DashboardSection>
      </div>
      <aside className="grid min-w-0 content-start gap-4 xl:col-span-5">
        <DashboardSection className="dashboard-upcoming" title={t("upcoming")}><BlueprintRows rows={6} /></DashboardSection>
        <DashboardSection title={t(employee ? "currentProjects" : "attentionProjects")} description={t(employee ? "projectsDescription" : "attentionProjectsDescription")}><BlueprintRows kind="projects" rows={6} /></DashboardSection>
        {!employee ? <DashboardSection title={t("myTasks")} description={t("myTasksDescription")}><BlueprintRows kind="tasks" rows={5} /></DashboardSection> : null}
      </aside>
    </div>
  </div>;
}
