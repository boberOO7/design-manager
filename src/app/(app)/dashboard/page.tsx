import Link from "next/link";
import { DashboardSection, MetricStrip, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboard } from "@/data/queries/dashboard";
import { DASHBOARD_EMPTY_STATES, getAdminDashboardMetrics, getAttentionProjectReason, getDashboardDeadlineHref, getEmployeeDashboardMetrics } from "@/lib/dashboard-presentation";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard | StudioFlow" };

export default async function DashboardPage() {
  const dashboard = await getDashboard();
  if (!dashboard) return <div className="space-y-8"><PageHeader title="Dashboard" description="Please log in to view your dashboard." /><EmptyState compact title="You must be logged in to view your dashboard." /></div>;
  return dashboard.kind === "employee" ? <EmployeeDashboard dashboard={dashboard} /> : <AdminDashboard dashboard={dashboard} />;
}

function EmployeeDashboard({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "employee" }> }) {
  return <div className="space-y-8">
    <PageHeader title={`Welcome back, ${dashboard.profile.full_name}`} description="Your personal work priorities and upcoming deadlines." />
    <MetricStrip metrics={getEmployeeDashboardMetrics(dashboard.metrics)} />
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]">
      <DashboardSection title="Needs attention" description="Your highest-priority open work.">
        <OperationalSurface>{dashboard.needsAttention.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.needsAttention} needsAttentionOnly emptyState={DASHBOARD_EMPTY_STATES.employeeAttention} /> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.employeeAttention} action={<Link href="/my-tasks" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4">View My Tasks</Link>} />}</OperationalSurface>
      </DashboardSection>
      <Deadlines deadlines={dashboard.deadlines} />
    </div>
    <DashboardSection title="Current projects" description="Your assigned project context.">
      {dashboard.projects.length ? <OperationalSurface><ul className="divide-y divide-[var(--ui-border)]">{dashboard.projects.map((project) => {
        const lifecycle = getProjectLifecycleBadgeStyle(project.status);
        return <li key={project.id}><Link href={`/projects/${project.id}`} className="grid min-h-16 gap-2 px-3 py-3 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{project.name}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-muted)]"><span className={`rounded-full px-2 py-0.5 font-medium ${lifecycle.className}`}>{lifecycle.label}</span><span>{project.project_code ?? project.client_name ?? "Assigned project"}</span></div></div><div className="text-sm text-[var(--ui-text-secondary)] sm:text-right"><p className="ui-numeric">{project.openTaskCount} open · {project.inProgressCount} in progress</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{project.nearestDueDate ? `Next due ${formatDate(project.nearestDueDate)}` : "No personal deadline"}</p></div></Link></li>;
      })}</ul></OperationalSurface> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.projects} />}
      {dashboard.hasMoreProjects ? <Link href="/projects" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)] underline underline-offset-4">View all projects</Link> : null}
    </DashboardSection>
  </div>;
}

function AdminDashboard({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" }> }) {
  return <div className="space-y-8">
    <PageHeader title={`Welcome back, ${dashboard.profile.full_name}`} description="Studio-wide operational priorities and your assigned work." />
    <MetricStrip metrics={getAdminDashboardMetrics(dashboard.metrics)} />
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]">
      <DashboardSection title="Projects requiring attention" description="Risk-ranked active projects.">
        <OperationalSurface>{dashboard.attentionProjects.length ? <ul className="divide-y divide-[var(--ui-border)]">{dashboard.attentionProjects.map((project) => <li key={project.id}><Link href={`/projects/${project.id}`} className="grid min-h-18 gap-2 px-3 py-3 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{project.name}</p><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{getAttentionProjectReason(project)}</p></div><div className="flex flex-wrap items-center gap-2 text-xs sm:justify-end"><span className="ui-numeric rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-stone-700">{project.openTaskCount} open</span>{project.overdueCount ? <span className="ui-numeric rounded-full border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-800">{project.overdueCount} overdue</span> : null}{project.deadlineDaysAway !== null ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-800">{project.deadlineDaysAway === 0 ? "Due today" : `Due in ${project.deadlineDaysAway}d`}</span> : null}<span className="font-medium text-[var(--ui-text-secondary)]">Open project</span></div></Link></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.adminAttention} />}</OperationalSurface>
      </DashboardSection>
      <Deadlines deadlines={dashboard.deadlines} />
    </div>
    <div className="grid items-start gap-8 xl:grid-cols-2">
      <DashboardSection title="Team workload" description="Open assigned work across active studio members.">
        <OperationalSurface>{dashboard.workload.length ? <ul className="divide-y divide-[var(--ui-border)]">{dashboard.workload.map((member) => <li key={member.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{member.full_name}</p><p className="text-sm text-[var(--ui-text-muted)]">{member.job_title}</p></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ui-text-secondary)] sm:justify-end"><span className="ui-numeric">{member.openTaskCount} open</span><span className="ui-numeric">{member.inProgressCount} in progress</span><span className={member.overdueCount ? "ui-numeric font-medium text-red-800" : "ui-numeric"}>{member.overdueCount} overdue</span></div></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.workload} />}</OperationalSurface>
      </DashboardSection>
      <DashboardSection title="My tasks" description="Your highest-priority assigned work.">
        <OperationalSurface>{dashboard.myTasks.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} /> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.myTasks} />}</OperationalSurface>
      </DashboardSection>
    </div>
  </div>;
}

function Deadlines({ deadlines }: { deadlines: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" | "employee" }>["deadlines"] }) {
  return <DashboardSection title="Upcoming deadlines" description="The next 14 days."><OperationalSurface>{deadlines.length ? <ul className="divide-y divide-[var(--ui-border)]">{deadlines.map((deadline) => <li key={`${deadline.kind}-${deadline.id}`}><Link href={getDashboardDeadlineHref(deadline)} className="flex min-h-16 items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-4"><div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{deadline.title}</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{deadline.kind === "task" ? `Task · ${deadline.project?.name}` : "Project deadline"}</p></div><span className="ui-numeric shrink-0 text-xs font-medium text-[var(--ui-text-secondary)]">{formatDate(deadline.dueDate)}</span></Link></li>)}</ul> : <EmptyState compact {...DASHBOARD_EMPTY_STATES.deadlines} />}</OperationalSurface></DashboardSection>;
}
