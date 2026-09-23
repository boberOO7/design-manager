import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUpRight, Banknote, CalendarDays, Check, CircleAlert, ClipboardCheck, ClipboardClock, FolderKanban, ListChecks, PhoneCall, Wrench, type LucideIcon } from "lucide-react";
import { DashboardSection, MetricStrip, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { BoundedDashboardList } from "@/components/dashboard/bounded-list";
import { TeamWorkload } from "@/components/dashboard/team-workload";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardAbsence } from "@/data/queries/dashboard-administration";
import type { DashboardOperations } from "@/data/queries/dashboard-operations";
import type { AdminDashboard } from "@/data/queries/dashboard";
import { formatAdministrationDateRange } from "@/lib/administration";
import { formatCalendarDateTime } from "@/lib/calendar";
import { selectAdminMyWork, selectAdminUpcoming, type AdminUpcomingItem } from "@/lib/dashboard";
import { getAdminDashboardMetrics } from "@/lib/dashboard-presentation";
import { financeOverdueDashboardHref, projectPaymentPresentation } from "@/lib/finance-planning";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { formatDate } from "@/lib/utils";

type AttentionItem = { key: string; title: string; context: string; href: string; icon: LucideIcon };

export async function AdminDashboardView({ administration, dashboard, operations }: {
  administration: { pendingCount: number; upcomingAbsences: DashboardAbsence[] } | null;
  dashboard: AdminDashboard;
  operations: DashboardOperations | null;
}) {
  const [t, roles, locale] = await Promise.all([getTranslations("Dashboard"), getTranslations("Roles"), getLocale()]);
  const workload = dashboard.workload.map((member) => {
    const roleKey = getCanonicalRoleTranslationKey(member.job_title);
    return roleKey ? { ...member, job_title: roles(roleKey) } : member;
  });
  const attention: AttentionItem[] = [
    ...(dashboard.metrics.overdueTasks ? [{ key: "tasks", title: t("attentionOverdueTasks", { count: dashboard.metrics.overdueTasks }), context: t("domainTasks"), href: "#team-workload", icon: CircleAlert }] : []),
    ...(operations?.finance?.overdueReceivableCount ? [{ key: "receivables", title: t("attentionReceivables", { count: operations.finance.overdueReceivableCount }), context: t("domainFinance"), href: financeOverdueDashboardHref("incoming"), icon: Banknote }] : []),
    ...(operations?.finance?.overdueObligationCount ? [{ key: "obligations", title: t("attentionObligations", { count: operations.finance.overdueObligationCount }), context: t("domainFinance"), href: financeOverdueDashboardHref("outgoing"), icon: Banknote }] : []),
    ...(operations?.crm.overdueCount ? [{ key: "crm", title: t("attentionCrm", { count: operations.crm.overdueCount }), context: t("domainCrm"), href: "/crm/leads?attention=1", icon: PhoneCall }] : []),
    ...(administration?.pendingCount ? [{ key: "time-off", title: t("attentionTimeOff", { count: administration.pendingCount }), context: t("domainAdministration"), href: "/admin#requests", icon: ClipboardClock }] : []),
    ...(operations?.submissions.urgentCount ? [{ key: "submissions", title: t("attentionSubmissions", { count: operations.submissions.urgentCount }), context: t("domainOffice"), href: "/office/submissions", icon: ClipboardClock }] : []),
    ...(operations?.office.overdueAssignmentCount ? [{ key: "office", title: t("attentionOfficeAssignments", { count: operations.office.overdueAssignmentCount }), context: t("domainOffice"), href: "/office/assignments", icon: ClipboardCheck }] : []),
    ...(operations?.equipment.overdueCount ? [{ key: "equipment", title: t("attentionEquipment", { count: operations.equipment.overdueCount }), context: t("domainEquipment"), href: "/office/equipment?view=maintenance", icon: Wrench }] : []),
  ];
  const attentionGridClass = attention.length <= 1 ? "grid" : attention.length === 2 ? "grid sm:grid-cols-2" : "grid sm:grid-cols-2 xl:grid-cols-3";
  const upcoming = selectAdminUpcoming([
    ...dashboard.deadlines.flatMap((deadline): AdminUpcomingItem[] => deadline.kind === "task" && deadline.project ? [{
      key: `task:${deadline.id}`, kind: "task", date: deadline.dueDate, title: deadline.title,
      context: deadline.project.name, href: `/projects/${deadline.project.id}?task=${deadline.id}`,
    }] : deadline.kind === "project" ? [{
      key: `project:${deadline.id}`, kind: "project", date: deadline.dueDate, title: deadline.title,
      context: t("projectDeadline"), href: `/projects/${deadline.id}`,
    }] : []),
    ...(operations?.finance?.upcoming ?? []).map((item): AdminUpcomingItem => {
      const paymentType = item.direction === "incoming" ? t("upcomingIncomingPayment") : t("upcomingOutgoingPayment");
      const project = item.projectName ? projectPaymentPresentation(item.description, item.projectName, paymentType, t("projectPayment")) : null;
      return { key: `finance:${item.id}`, kind: "finance", date: item.date, title: project?.title ?? (item.description || paymentType),
        context: project?.context ?? (item.obligationKind === "payroll" ? t("upcomingPayroll") : paymentType), href: `/finance/expected?item=${item.id}` };
    }),
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
  ], dashboard.today);

  return <div className="space-y-5">
    <section className="dashboard-reveal">
      <div className="grid min-w-0 lg:grid-cols-[minmax(15rem,0.82fr)_minmax(0,1.18fr)]">
        <header className="flex min-h-32 items-end px-5 py-5 sm:px-7 sm:py-6">
          <h1 className="max-w-5xl text-3xl font-semibold tracking-[-0.035em] text-[var(--ui-text)] sm:text-4xl"><span className="block text-[var(--ui-text-secondary)]">{t("welcome")}</span><span className="block">{dashboard.profile.full_name}</span></h1>
        </header>
        <MetricStrip metrics={getAdminDashboardMetrics(dashboard.metrics)} className="rounded-none border-x-0 border-b-0 border-t border-[var(--ui-border)] bg-transparent shadow-none lg:border-l lg:border-t-0" metricClassName="px-4 py-4 sm:px-5 sm:py-5" />
      </div>
    </section>
    <div className="grid items-start gap-5 xl:grid-cols-12">
      <div className="grid min-w-0 content-start gap-5 xl:col-span-7">
      <DashboardSection className="dashboard-reveal dashboard-reveal-delay-1" title={t("needsAttention")}>
        <OperationalSurface className="p-1.5">{attention.length ? <ul className={attentionGridClass}>{attention.map((item) => <li key={item.key}>
          <Link href={item.href} className="group grid min-h-[5.25rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)] shadow-sm"><item.icon className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0"><b className="block text-sm leading-5">{item.title}</b><small className="mt-0.5 block text-[var(--ui-text-muted)]">{item.context}</small></span>
            <ArrowUpRight className="size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)]" aria-hidden="true" />
          </Link>
        </li>)}</ul> : <div className="flex min-h-[5.25rem] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-3 text-sm text-[var(--ui-text-secondary)]"><span className="flex size-9 items-center justify-center rounded-full bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]"><Check className="size-4" aria-hidden="true" /></span>{t("emptyOperationalAttention")}</div>}</OperationalSurface>
      </DashboardSection>
      <div id="team-workload" className="dashboard-reveal dashboard-reveal-delay-2 scroll-mt-5"><DashboardSection title={t("teamWorkload")}><OperationalSurface className="p-1.5">{workload.length ? <BoundedDashboardList resizable resizeLabel={t("resizeWorkload")}><TeamWorkload asOf={dashboard.asOf} members={workload} today={dashboard.today} /></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyWorkload")} />}</OperationalSurface></DashboardSection></div>
      </div>
      <aside className="grid min-w-0 content-start gap-5 xl:col-span-5">
        <DashboardSection className="dashboard-reveal dashboard-reveal-delay-2" title={t("upcoming")}>
          <OperationalSurface className="p-1.5">{upcoming.length ? <BoundedDashboardList><ul className="space-y-1">{upcoming.map((item) => <UpcomingRow key={item.key} item={item} locale={locale} />)}</ul></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyUpcoming")} />}</OperationalSurface>
        </DashboardSection>
        <AttentionProjects dashboard={dashboard} />
        <MyTasks dashboard={dashboard} operations={operations} />
        {administration?.upcomingAbsences.length ? <Availability absences={administration.upcomingAbsences} /> : null}
      </aside>
    </div>
  </div>;
}

async function AttentionProjects({ dashboard }: { dashboard: AdminDashboard }) {
  const t = await getTranslations("Dashboard");
  return <DashboardSection className="dashboard-reveal dashboard-reveal-delay-3" title={t("attentionProjects")} description={t("attentionProjectsDescription")}><OperationalSurface className="p-1.5">{dashboard.attentionProjects.length ? <ul className="space-y-1">{dashboard.attentionProjects.map((project) => <li key={project.id}><Link href={`/projects/${project.id}`} className="group flex min-h-[4.25rem] items-center justify-between gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]"><div className="min-w-0"><p className="truncate font-medium">{project.name}</p><p className="mt-0.5 truncate text-xs text-[var(--ui-text-muted)]">{[project.overdueCount ? t("reasonOverdue", { count: project.overdueCount }) : null, project.deadlineDaysAway === 0 ? t("reasonDeadlineToday") : project.deadlineDaysAway !== null ? t("reasonDeadlineDays", { count: project.deadlineDaysAway }) : null, project.urgentCount ? t("reasonUrgent", { count: project.urgentCount }) : null].filter(Boolean).join(" · ")}</p></div><ArrowUpRight className="size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)]" aria-hidden="true" /></Link></li>)}</ul> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyAdminAttention")} />}</OperationalSurface></DashboardSection>;
}

async function MyTasks({ dashboard, operations }: { dashboard: AdminDashboard; operations: DashboardOperations | null }) {
  const t = await getTranslations("Dashboard");
  const items = selectAdminMyWork(dashboard.myTasks, operations?.office.myAssignments ?? [], dashboard.today);
  return <DashboardSection className="dashboard-reveal dashboard-reveal-delay-3" title={t("myTasks")} description={t("myTasksDescription")}><OperationalSurface className="p-1.5">{items.length ? <BoundedDashboardList><DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} adminItems={items} today={dashboard.today} /></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyMyTasks")} />}</OperationalSurface></DashboardSection>;
}

async function Availability({ absences }: { absences: DashboardAbsence[] }) {
  const [t, locale] = await Promise.all([getTranslations("Dashboard"), getLocale()]);
  return <DashboardSection className="dashboard-reveal dashboard-reveal-delay-3" title={t("upcomingAvailability")} description={t("upcomingAvailabilityDescription")}><OperationalSurface className="p-1.5"><ul className="space-y-1">{absences.slice(0, 3).map((absence) => <li key={absence.id} className="rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5"><p className="font-medium">{absence.employeeName}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{formatAdministrationDateRange(absence, locale)}</p></li>)}</ul><Button asChild size="sm" variant="ghost" className="m-1 min-h-11"><Link href="/calendar?timeOff=1"><CalendarDays className="size-4" aria-hidden="true" />{t("viewTeamCalendar")}</Link></Button></OperationalSurface></DashboardSection>;
}

function UpcomingRow({ item, locale }: { item: AdminUpcomingItem; locale: string }) {
  const iconByKind: Record<AdminUpcomingItem["kind"], LucideIcon> = { task: ListChecks, project: FolderKanban, finance: Banknote, crm: PhoneCall, assignment: ClipboardCheck, equipment: Wrench };
  const Icon = iconByKind[item.kind];
  const dateLabel = item.kind === "crm" ? formatCalendarDateTime(item.date, locale) : formatDate(item.date, locale);
  return <li><Link href={item.href} className="group grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
    <span className="flex size-8 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] transition-colors duration-200 group-hover:bg-[var(--ui-surface-strong)]"><Icon className="size-4" aria-hidden="true" /></span>
    <span className="min-w-0"><b className="block truncate text-sm">{item.title}</b>{item.context ? <small className="mt-0.5 block break-words text-[var(--ui-text-muted)]">{item.context}</small> : null}</span>
    <time dateTime={item.date} className="ui-numeric whitespace-nowrap text-right text-xs font-medium text-[var(--ui-text-secondary)]">{dateLabel}</time>
  </Link></li>;
}
