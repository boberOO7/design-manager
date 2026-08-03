import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { DashboardSection, MetricStrip, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getAdministrationData } from "@/data/queries/administration";
import { getDashboard } from "@/data/queries/dashboard";
import { DASHBOARD_EMPTY_STATES, getAdminDashboardMetrics, getAttentionProjectReason, getDashboardDeadlineHref, getEmployeeDashboardMetrics } from "@/lib/dashboard-presentation";
import { formatAdministrationDateRange, getTimeOffRequestTypeLabel, type AdministrationModel } from "@/lib/administration";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard | StudioFlow" };

export default async function DashboardPage() {
  const dashboard = await getDashboard();
  if (!dashboard) return <div className="space-y-8"><PageHeader title="Dashboard" description="Please log in to view your dashboard." /><EmptyState compact title="You must be logged in to view your dashboard." /></div>;
  if (dashboard.kind === "employee") return <EmployeeDashboard dashboard={dashboard} />;
  const administration = await getAdministrationData();
  return <AdminDashboard dashboard={dashboard} administration={administration} />;
}

function EmployeeDashboard({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "employee" }> }) {
  return <div className="space-y-8">
    <PageHeader title="Welcome back" description="Your personal work priorities and upcoming deadlines." />
    <MetricStrip metrics={getEmployeeDashboardMetrics(dashboard.metrics)} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <DashboardSection title="Needs attention" description="Your highest-priority open work.">
        <OperationalSurface>{dashboard.needsAttention.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.needsAttention} needsAttentionOnly emptyState={DASHBOARD_EMPTY_STATES.employeeAttention} /> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.employeeAttention} action={<Link href="/my-tasks" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4">View My Tasks</Link>} />}</OperationalSurface>
      </DashboardSection>
      <Deadlines deadlines={dashboard.deadlines} />
    </div>
    <DashboardSection title="Current projects" description="Your assigned project context.">
      {dashboard.projects.length ? <OperationalSurface><ul className="divide-y divide-[var(--ui-border)]">{dashboard.projects.map((project) => {
        const lifecycle = getProjectLifecycleBadgeStyle(project.status);
        return <li key={project.id}><Link href={`/projects/${project.id}`} className="grid min-h-16 gap-2 px-3 py-3 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{project.name}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-muted)]"><span className={`rounded-full px-2 py-0.5 font-medium ${lifecycle.className}`}>{lifecycle.label}</span><span>{project.project_code ?? project.client_name ?? "Assigned project"}</span></div></div><div className="text-sm text-[var(--ui-text-secondary)] sm:text-right"><p className="ui-numeric">{project.progressPercent === null ? "No tasks yet" : `${project.progressPercent}% progress`} · {project.openTaskCount} open</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{project.nearestDueDate ? `Next due ${formatDate(project.nearestDueDate)}` : "No personal deadline"}</p></div></Link></li>;
      })}</ul></OperationalSurface> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.projects} />}
      {dashboard.hasMoreProjects ? <Link href="/projects" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4">View all projects</Link> : null}
    </DashboardSection>
  </div>;
}

function AdminDashboard({ administration, dashboard }: { administration: Pick<AdministrationModel, "pendingRequests" | "upcomingAbsences"> | null; dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" }> }) {
  return <div className="space-y-8">
    <PageHeader title="Welcome back" description="Studio-wide operational priorities and your assigned work." />
    <MetricStrip metrics={getAdminDashboardMetrics(dashboard.metrics)} />
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.85fr)] lg:grid-cols-12">
      <div className="min-w-0 space-y-6 lg:col-span-8">
        <DashboardSection title="Projects requiring attention" description="Risk-ranked active projects.">
        <OperationalSurface>{dashboard.attentionProjects.length ? <ul className="divide-y divide-[var(--ui-border)]">{dashboard.attentionProjects.map((project) => <li key={project.id}><Link aria-label={`Open project ${project.name}`} href={`/projects/${project.id}`} className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-4 md:grid-cols-[minmax(0,1fr)_4.5rem_minmax(8rem,auto)] md:items-center"><div className="col-span-2 min-w-0 md:col-span-1"><div className="flex items-start gap-2"><p className="min-w-0 font-medium text-[var(--ui-text)]">{project.name}</p><ArrowUpRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" /></div><p className="mt-0.5 text-xs text-[var(--ui-text-secondary)]">{getAttentionProjectReason(project)}</p></div><div className="text-xs md:text-right"><p className="text-[var(--ui-text-muted)]">Progress</p><p className="ui-numeric mt-0.5 font-medium text-[var(--ui-text-secondary)]">{project.progressPercent === null ? "No tasks yet" : `${project.progressPercent}%`}</p></div><div className="text-right text-xs md:text-left"><p className="text-[var(--ui-text-muted)]">Open work</p><div className="mt-0.5 flex justify-end gap-x-2 md:justify-start"><span className="ui-numeric font-medium text-[var(--ui-text-secondary)]">{project.openTaskCount} open</span>{project.overdueCount ? <span className="ui-numeric font-medium text-[var(--ui-danger-text)]">{project.overdueCount} overdue</span> : null}</div></div></Link></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.adminAttention} />}</OperationalSurface>
        </DashboardSection>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
          <DashboardSection title="My tasks" description="Your highest-priority assigned work.">
            <OperationalSurface>{dashboard.myTasks.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} /> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.myTasks} />}</OperationalSurface>
          </DashboardSection>
          <DashboardSection title="Team workload" description="Open assigned work across active studio members.">
        <OperationalSurface>{dashboard.workload.length ? <ul className="divide-y divide-[var(--ui-border)]">{dashboard.workload.map((member) => <li key={member.id} className="grid gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{member.full_name}</p><p className="text-xs text-[var(--ui-text-muted)]">{member.job_title}</p></div><div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--ui-text-secondary)] sm:justify-end"><span className="ui-numeric">{member.openTaskCount} open</span><span className="ui-numeric">{member.inProgressCount} in progress</span><span className={member.overdueCount ? "ui-numeric font-medium text-[var(--ui-danger-text)]" : "ui-numeric"}>{member.overdueCount} overdue</span></div></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.workload} />}</OperationalSurface>
          </DashboardSection>
        </div>
      </div>
      <aside className="min-w-0 space-y-6 lg:col-span-4">
        <Deadlines deadlines={dashboard.deadlines} />
        {administration?.upcomingAbsences.length ? <UpcomingAvailability absences={administration.upcomingAbsences} /> : null}
        {administration?.pendingRequests.length ? <PendingAdminActions pendingCount={administration.pendingRequests.length} /> : null}
      </aside>
    </div>
  </div>;
}

function UpcomingAvailability({ absences }: { absences: AdministrationModel["upcomingAbsences"] }) {
  return <DashboardSection title="Upcoming availability" description="Approved team absence over the next 30 days."><OperationalSurface><ul className="divide-y divide-[var(--ui-border)]">{absences.slice(0, 3).map((absence) => <li key={absence.id} className="px-3 py-2.5 sm:px-4"><p className="font-medium text-[var(--ui-text)]">{absence.employeeName}</p><p className="mt-0.5 text-xs text-[var(--ui-text-secondary)]">{getTimeOffRequestTypeLabel(absence.requestType)} · {formatAdministrationDateRange(absence)}</p></li>)}</ul><div className="p-2 sm:p-3"><Button asChild size="sm" variant="ghost" className="min-h-11 gap-2 px-3"><Link href="/calendar?timeOff=1"><CalendarDays aria-hidden="true" className="size-4" />View team calendar</Link></Button></div></OperationalSurface></DashboardSection>;
}

function PendingAdminActions({ pendingCount }: { pendingCount: number }) {
  return <DashboardSection title="Pending admin actions"><OperationalSurface className="border-[var(--ui-warning-border)] px-3 py-3 sm:px-4"><div className="flex items-start justify-between gap-3"><div><p className="ui-numeric text-lg font-semibold text-[var(--ui-warning-text)]">{pendingCount} pending</p><p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">Time-off requests need review.</p></div><Link href="/admin#requests" className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]">Review</Link></div></OperationalSurface></DashboardSection>;
}

function Deadlines({ className, deadlines }: { className?: string; deadlines: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" | "employee" }>["deadlines"] }) {
  return <DashboardSection className={className} title="Upcoming deadlines" description="The next 14 days."><OperationalSurface>{deadlines.length ? <ul className="divide-y divide-[var(--ui-border)]">{deadlines.map((deadline) => <li key={`${deadline.kind}-${deadline.id}`}><Link href={getDashboardDeadlineHref(deadline)} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{deadline.title}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{deadline.kind === "task" ? `Task · ${deadline.project?.name}` : "Project deadline"}</p></div><span className="ui-numeric shrink-0 text-xs font-medium text-[var(--ui-text-secondary)]">{formatDate(deadline.dueDate)}</span></Link></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.deadlines} />}</OperationalSurface></DashboardSection>;
}
