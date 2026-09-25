import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, CircleAlert } from "lucide-react";
import { AdminDashboardView } from "@/components/dashboard/admin-dashboard";
import { BoundedDashboardList } from "@/components/dashboard/bounded-list";
import { DashboardOverview, DashboardSection, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboardAdministration } from "@/data/queries/dashboard-administration";
import { getDashboardOperations } from "@/data/queries/dashboard-operations";
import { getDashboard, type EmployeeDashboard } from "@/data/queries/dashboard";
import { selectAdminMyWork, selectAdminUpcoming, type AdminUpcomingItem } from "@/lib/dashboard";
import { getDashboardDeadlineHref, getEmployeeDashboardMetrics } from "@/lib/dashboard-presentation";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslations("Dashboard"); return { title: t("metadata") }; }

export default async function DashboardPage() {
  const [dashboard, t] = await Promise.all([getDashboard(), getTranslations("Dashboard")]);
  if (!dashboard) return <div className="space-y-8"><PageHeader title={t("title")} description={t("loginDescription")} /><EmptyState compact title={t("loginRequired")} /></div>;
  if (dashboard.kind === "employee") return <Employee dashboard={dashboard} />;
  const [administration, operations] = await Promise.all([getDashboardAdministration(), getDashboardOperations(dashboard.today)]);
  return <AdminDashboardView dashboard={dashboard} administration={administration} operations={operations} />;
}

async function Employee({ dashboard }: { dashboard: EmployeeDashboard }) {
  const [t, status, locale] = await Promise.all([getTranslations("Dashboard"), getTranslations("Status"), getLocale()]);
  const myWork = selectAdminMyWork(dashboard.myTasks, dashboard.myAssignments, dashboard.today);
  const upcoming = selectAdminUpcoming([
    ...dashboard.deadlines.map((deadline): AdminUpcomingItem => ({ key: `${deadline.kind}:${deadline.id}`, kind: deadline.kind, date: deadline.dueDate, title: deadline.title, context: deadline.project?.name ?? t("projectDeadline"), href: getDashboardDeadlineHref(deadline) })),
    ...dashboard.myAssignments.flatMap((assignment): AdminUpcomingItem[] => assignment.deadline && assignment.deadline >= dashboard.today ? [{ key: `assignment:${assignment.id}`, kind: "assignment", date: assignment.deadline, title: assignment.title, context: t("officeAssignment"), href: `/office/assignments?item=${assignment.id}` }] : []),
  ], dashboard.today);
  return <div className="space-y-5">
    <DashboardOverview metrics={getEmployeeDashboardMetrics(dashboard.metrics, locale)} />
    <div className="grid items-start gap-5 xl:grid-cols-12">
      <div className="grid min-w-0 content-start gap-5 xl:col-span-7">
        {dashboard.attention.length ? <DashboardSection title={t("needsAttention")}><OperationalSurface className="p-2"><ul className="flex flex-wrap gap-2">{dashboard.attention.map((item) => {
          const isOverdue = item.kind === "overdueTasks" || item.kind === "overdueAssignments";
          const isOffice = item.kind === "overdueAssignments" || item.kind === "urgentAssignments";
          return <li key={item.kind}><Link href={isOffice ? "/office/assignments" : "/my-tasks"} className={`inline-flex min-h-10 items-center gap-2 rounded-[var(--ui-radius-control)] px-3 py-2 text-sm font-medium transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${isOverdue ? "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]" : "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]"}`}><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{item.kind === "overdueTasks" ? t("attentionOverdueTasks", { count: item.count }) : item.kind === "urgentTasks" ? t("attentionUrgentTasks", { count: item.count }) : item.kind === "overdueAssignments" ? t("attentionOfficeAssignments", { count: item.count }) : t("attentionUrgentOfficeAssignments", { count: item.count })}</Link></li>;
        })}</ul></OperationalSurface></DashboardSection> : null}
        <DashboardSection title={t("myWork")} description={t("myTasksDescription")}><OperationalSurface className="p-1.5">{myWork.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} items={myWork} today={dashboard.today} /> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyMyTasks")} />}</OperationalSurface></DashboardSection>
      </div>
      <aside className="grid min-w-0 content-start gap-5 xl:col-span-5">
        <DashboardSection title={t("upcoming")}><OperationalSurface className="p-1.5">{upcoming.length ? <BoundedDashboardList><ul className="space-y-1">{upcoming.map((item) => <li key={item.key}><Link href={item.href} className="group grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]"><span className="flex size-8 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]">{item.kind === "assignment" ? <CircleAlert className="size-4" aria-hidden="true" /> : <CalendarDays className="size-4" aria-hidden="true" />}</span><span className="min-w-0"><b className="block truncate text-sm">{item.title}</b><small className="mt-0.5 block text-[var(--ui-text-muted)]">{item.context}</small></span><time dateTime={item.date} className="ui-numeric whitespace-nowrap text-xs text-[var(--ui-text-secondary)]">{formatDate(item.date, locale)}</time></Link></li>)}</ul></BoundedDashboardList> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyUpcoming")} />}</OperationalSurface></DashboardSection>
        <DashboardSection title={t("currentProjects")} description={t("projectsDescription")}><OperationalSurface className="p-1.5">{dashboard.projects.length ? <ul className="space-y-1">{dashboard.projects.map((project) => { const badge = getProjectLifecycleBadgeStyle(project.status); return <li key={project.id}><Link href={`/projects/${project.id}`} className="group grid min-h-[4.5rem] gap-2 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)] sm:grid-cols-[minmax(0,1fr)_auto]"><span className="min-w-0"><b className="block truncate text-sm">{project.name}</b><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${badge.className}`}>{status(project.status)}</span></span><span className="text-xs text-[var(--ui-text-secondary)] sm:text-right"><span className="ui-numeric block">{project.progressPercent === null ? t("noTasksYet") : t("progress", { count: project.progressPercent })} · {t("openCount", { count: project.openTaskCount })}</span><span className="mt-1 block text-[var(--ui-text-muted)]">{project.nearestDueDate ? t("nextDue", { date: formatDate(project.nearestDueDate, locale) }) : t("noPersonalDeadline")}</span></span></Link></li>; })}</ul> : <EmptyState compact className="border-0 bg-transparent" title={t("emptyProjects")} />}</OperationalSurface></DashboardSection>
      </aside>
    </div>
  </div>;
}
