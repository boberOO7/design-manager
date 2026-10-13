import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUpRight, CalendarDays, CircleAlert } from "lucide-react";
import { DashboardSection, MetricCell, MetricPanel, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { BoundedDashboardList } from "@/components/dashboard/bounded-list";
import { TeamWorkload } from "@/components/dashboard/team-workload";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardAbsence } from "@/data/queries/dashboard-administration";
import type { DashboardOperationalSignals, DashboardFinance } from "@/data/queries/dashboard-operations";
import type { AdminDashboard } from "@/data/queries/dashboard";
import { formatAdministrationDateRange } from "@/lib/administration";
import { selectAdminMyWork, type AdminUpcomingItem } from "@/lib/dashboard";
import { getAdminDashboardMetrics } from "@/lib/dashboard-presentation";
import { formatFinanceDecimal } from "@/lib/finance";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";

import { Suspense } from "react";
import { BlueprintRows, MetricBlueprint } from "./dashboard-blueprint";
import { DashboardReady } from "./dashboard-motion";
import { AttentionFeed, UpcomingFeed, type AttentionItem } from "./dashboard-feeds";

type Administration = { pendingCount: number; upcomingAbsences: DashboardAbsence[] } | null;
export type AdminDashboardSources = {
  dashboard: Promise<AdminDashboard | null>;
  administration: Promise<Administration>;
  operations: Promise<DashboardOperationalSignals | null>;
  finance: Promise<DashboardFinance>;
};

export async function AdminDashboardView(sources: AdminDashboardSources) {
  const t = await getTranslations("Dashboard");
  return <div className="space-y-5" data-dashboard-shell="streaming">
    <section className="space-y-3"><h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1>
      <MetricPanel>
        <Suspense fallback={<>{(["metricActiveProjects", "metricOpenTasks", "metricOverdueTasks"] as const).map(labelKey => <MetricBlueprint key={labelKey} labelKey={labelKey} />)}</>}><TaskMetrics pending={sources.dashboard} /></Suspense>
        <Suspense fallback={<MetricBlueprint labelKey="metricActiveLeads" />}><CrmMetric pending={sources.operations} /></Suspense>
        <Suspense fallback={<><MetricBlueprint labelKey="metricExpectedInflow" /><MetricBlueprint labelKey="metricProfitLoss" /></>}><FinanceMetrics pending={sources.finance} /></Suspense>
      </MetricPanel>
    </section>
    <Suspense fallback={null}><FinanceStatus pending={sources.finance} /></Suspense>
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="grid min-w-0 content-start gap-4 xl:col-span-7">
        <DashboardSection className="dashboard-attention" title={t("needsAttention")}><Suspense fallback={<BlueprintRows kind="attention" rows={6} />}><Attention sources={sources} /></Suspense></DashboardSection>
        <div id="team-workload" className="scroll-mt-5"><DashboardSection flushContent title={t("teamWorkload")}><Suspense fallback={<BlueprintRows kind="workload" rows={10} />}><Workload pending={sources.dashboard} /></Suspense></DashboardSection></div>
      </div>
      <aside className="grid min-w-0 content-start gap-4 xl:col-span-5">
        <DashboardSection className="dashboard-upcoming" title={t("upcoming")}><Suspense fallback={<BlueprintRows rows={6} />}><Upcoming sources={sources} /></Suspense></DashboardSection>
        <DashboardSection title={t("attentionProjects")} description={t("attentionProjectsDescription")}><Suspense fallback={<BlueprintRows kind="projects" rows={6} />}><Projects pending={sources.dashboard} /></Suspense></DashboardSection>
        <DashboardSection title={t("myTasks")} description={t("myTasksDescription")}><Suspense fallback={<BlueprintRows kind="tasks" rows={5} />}><PersonalTasks sources={sources} /></Suspense></DashboardSection>
        <Suspense fallback={null}><TeamAvailability pending={sources.administration} /></Suspense>
      </aside>
    </div>
  </div>;
}

async function TaskMetrics({ pending }: { pending: AdminDashboardSources["dashboard"] }) {
  const dashboard = await pending;
  if (!dashboard) return null;
  return <DashboardReady name="task-metrics" className="contents">{getAdminDashboardMetrics({ ...dashboard.metrics, activeLeads: 0, expectedInflow: "—", profitAndLoss: "—" }).slice(0, 3).map(metric => <MetricCell key={metric.labelKey} metric={metric} />)}</DashboardReady>;
}

async function CrmMetric({ pending }: { pending: AdminDashboardSources["operations"] }) {
  const operations = await pending;
  return <DashboardReady name="crm-metric" className="contents"><MetricCell metric={{ labelKey: "metricActiveLeads", value: operations?.crm.activeCount ?? 0, tone: "neutral" }} /></DashboardReady>;
}

export async function FinanceMetrics({ pending }: { pending: Promise<DashboardFinance> }) {
  const [result, locale] = await Promise.all([pending, getLocale()]);
  const month = result.finance?.month;
  const money = (value: string | null | undefined) => month && value != null ? formatFinanceDecimal(value, locale, { style: "currency", currency: month.currency, currencyDisplay: "code" }) : "—";
  const profit = money(month?.profitAndLoss);
  return <DashboardReady name="finance-metrics" className="contents"><MetricCell metric={{ labelKey: "metricExpectedInflow", value: money(month?.expectedInflow), tone: "neutral" }} /><MetricCell metric={{ labelKey: "metricProfitLoss", value: profit, tone: profit.startsWith("-") ? "danger" : "neutral" }} /></DashboardReady>;
}

export async function FinanceStatus({ pending }: { pending: Promise<DashboardFinance> }) {
  const result = await pending;
  if (!result.financeUnavailable) return null;
  const t = await getTranslations("Dashboard");
  return <OperationalSurface className="flex items-center gap-3 px-4 py-3"><CircleAlert className="size-4 shrink-0 text-[var(--ui-warning-text)]" aria-hidden="true" /><p role="status" className="text-sm text-[var(--ui-text-secondary)]">{t("financeUnavailable")}</p></OperationalSurface>;
}

async function Workload({ pending }: { pending: AdminDashboardSources["dashboard"] }) {
  const [dashboard, t, roles] = await Promise.all([pending, getTranslations("Dashboard"), getTranslations("Roles")]);
  if (!dashboard) return <EmptyState compact className="border-0 bg-transparent" title={t("loginRequired")} />;
  const workload = dashboard.workload.map(member => {
    const roleKey = getCanonicalRoleTranslationKey(member.job_title);
    return roleKey ? { ...member, job_title: roles(roleKey) } : member;
  });
  return <DashboardReady name="workload">{workload.length ? <BoundedDashboardList resizable resizeLabel={t("resizeWorkload")}><TeamWorkload asOf={dashboard.asOf} members={workload} today={dashboard.today} /></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyWorkload")} />}</DashboardReady>;
}

async function Attention({ sources }: { sources: AdminDashboardSources }) {
  const [dashboard, operations, administration, t] = await Promise.all([sources.dashboard, sources.operations, sources.administration, getTranslations("Dashboard")]);
  if (!dashboard) return null;
  const attention: AttentionItem[] = [
    ...(dashboard.metrics.overdueTasks ? [{ key: "tasks", title: t("attentionOverdueTasks", { count: dashboard.metrics.overdueTasks }), context: t("domainTasks"), href: "#team-workload", icon: "tasks" as const }] : []),
    ...(operations?.crm.overdueCount ? [{ key: "crm", title: t("attentionCrm", { count: operations.crm.overdueCount }), context: t("domainCrm"), href: "/crm/leads?attention=1", icon: "crm" as const }] : []),
    ...(administration?.pendingCount ? [{ key: "time-off", title: t("attentionTimeOff", { count: administration.pendingCount }), context: t("domainAdministration"), href: "/admin#requests", icon: "time-off" as const }] : []),
    ...(operations?.submissions.urgentCount ? [{ key: "submissions", title: t("attentionSubmissions", { count: operations.submissions.urgentCount }), context: t("domainOffice"), href: "/office/submissions", icon: "submissions" as const }] : []),
    ...(operations?.office.overdueAssignmentCount ? [{ key: "office", title: t("attentionOfficeAssignments", { count: operations.office.overdueAssignmentCount }), context: t("domainOffice"), href: "/office/assignments", icon: "office" as const }] : []),
    ...(operations?.equipment.overdueCount ? [{ key: "equipment", title: t("attentionEquipment", { count: operations.equipment.overdueCount }), context: t("domainEquipment"), href: "/office/equipment?view=maintenance", icon: "equipment" as const }] : []),
  ];
  return <AttentionFeed items={attention} finance={sources.finance} />;
}

async function Upcoming({ sources }: { sources: AdminDashboardSources }) {
  const [dashboard, operations, t] = await Promise.all([sources.dashboard, sources.operations, getTranslations("Dashboard")]);
  if (!dashboard) return null;
  const upcoming: AdminUpcomingItem[] = [
    ...dashboard.deadlines.flatMap((deadline): AdminUpcomingItem[] => deadline.kind === "task" && deadline.project ? [{
      key: `task:${deadline.id}`, kind: "task", date: deadline.dueDate, title: deadline.title,
      context: deadline.project.name, href: `/projects/${deadline.project.id}?task=${deadline.id}`,
    }] : deadline.kind === "project" ? [{
      key: `project:${deadline.id}`, kind: "project", date: deadline.dueDate, title: deadline.title,
      context: t("projectDeadline"), href: `/projects/${deadline.id}`,
    }] : []),
    ...(operations?.crm.upcoming ?? []).map((followUp): AdminUpcomingItem => ({
      key: `crm:${followUp.id}`, kind: "crm", date: followUp.nextContactAt, title: followUp.clientName,
      context: t("upcomingCrmFollowUp"), href: `/crm/leads?lead=${followUp.id}`,
    })),
    ...(operations?.office.upcoming ?? []).map((assignment): AdminUpcomingItem => ({
      key: `assignment:${assignment.id}`, kind: "assignment", date: assignment.deadline,
      title: assignment.title, context: t("officeAssignment"), href: `/office/assignments?item=${assignment.id}`,
    })),
    ...(operations?.equipment.upcoming ?? []).map((item): AdminUpcomingItem => ({
      key: `equipment:${item.id}`, kind: "equipment", date: item.date,
      title: item.title, context: t("upcomingEquipment"), href: `/office/equipment?view=maintenance&item=${item.id}`,
    })),
  ];
  return <UpcomingFeed items={upcoming} today={dashboard.today} finance={sources.finance} />;
}

async function Projects({ pending }: { pending: AdminDashboardSources["dashboard"] }) {
  const dashboard = await pending;
  return dashboard ? <AttentionProjects dashboard={dashboard} /> : null;
}

async function PersonalTasks({ sources }: { sources: AdminDashboardSources }) {
  const [dashboard, operations] = await Promise.all([sources.dashboard, sources.operations]);
  return dashboard ? <MyTasks dashboard={dashboard} operations={operations} /> : null;
}

async function TeamAvailability({ pending }: { pending: AdminDashboardSources["administration"] }) {
  const administration = await pending;
  return administration?.upcomingAbsences.length ? <Availability absences={administration.upcomingAbsences} /> : null;
}

async function AttentionProjects({ dashboard }: { dashboard: AdminDashboard }) {
  const t = await getTranslations("Dashboard");
  return <DashboardReady name="projects">{dashboard.attentionProjects.length ? <ul className="space-y-1">{dashboard.attentionProjects.map((project) => <li key={project.id} data-dashboard-arrival={`project:${project.id}`}><Link href={`/projects/${project.id}`} className="group flex min-h-[4.25rem] items-center justify-between gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors duration-[180ms] ease-out hover:bg-[var(--ui-surface-muted)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]"><div className="min-w-0"><p className="truncate font-medium">{project.name}</p><p className="mt-0.5 truncate text-xs text-[var(--ui-text-muted)]">{[project.overdueCount ? t("reasonOverdue", { count: project.overdueCount }) : null, project.deadlineDaysAway === 0 ? t("reasonDeadlineToday") : project.deadlineDaysAway !== null ? t("reasonDeadlineDays", { count: project.deadlineDaysAway }) : null, project.urgentCount ? t("reasonUrgent", { count: project.urgentCount }) : null].filter(Boolean).join(" · ")}</p></div><ArrowUpRight className="size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)]" aria-hidden="true" /></Link></li>)}</ul> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyAdminAttention")} />}</DashboardReady>;
}

async function MyTasks({ dashboard, operations }: { dashboard: AdminDashboard; operations: DashboardOperationalSignals | null }) {
  const t = await getTranslations("Dashboard");
  const items = selectAdminMyWork(dashboard.myTasks, operations?.office.myAssignments ?? [], dashboard.today);
  return <DashboardReady name="personal-tasks">{items.length ? <BoundedDashboardList><DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} items={items} today={dashboard.today} /></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyMyTasks")} />}</DashboardReady>;
}

async function Availability({ absences }: { absences: DashboardAbsence[] }) {
  const [t, locale] = await Promise.all([getTranslations("Dashboard"), getLocale()]);
  return <DashboardReady name="availability"><DashboardSection title={t("upcomingAvailability")} description={t("upcomingAvailabilityDescription")}><ul className="space-y-1">{absences.slice(0, 3).map((absence) => <li key={absence.id} data-dashboard-arrival={`absence:${absence.id}`} className="rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5"><p className="font-medium">{absence.employeeName}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{formatAdministrationDateRange(absence, locale)}</p></li>)}</ul><Button asChild size="sm" variant="ghost" className="m-1 min-h-11 gap-2"><Link href="/calendar?timeOff=1"><CalendarDays className="size-4" aria-hidden="true" />{t("viewTeamCalendar")}</Link></Button></DashboardSection></DashboardReady>;
}
