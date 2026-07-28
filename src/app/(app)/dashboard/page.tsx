import Link from "next/link";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboard } from "@/data/queries/dashboard";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard | StudioFlow" };

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="font-semibold text-stone-900">{title}</h2><p className="mt-1 text-sm text-stone-500">{description}</p></div>{children}</section>;
}

export default async function DashboardPage() {
  const dashboard = await getDashboard();
  if (!dashboard) return <div className="space-y-8"><PageHeader title="Dashboard" description="Please log in to view your dashboard." /><div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">You must be logged in to view your dashboard.</div></div>;
  if (dashboard.kind === "employee") return <EmployeeDashboard dashboard={dashboard} />;
  return <AdminDashboard dashboard={dashboard} />;
}

function EmployeeDashboard({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "employee" }> }) {
  return <div className="space-y-6"><PageHeader title={`Welcome back, ${dashboard.profile.full_name}`} description="Your work priorities and accessible project deadlines." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Overdue" value={formatNumber(dashboard.metrics.overdue)} hint="Open tasks past due" /><MetricCard title="Due today" value={formatNumber(dashboard.metrics.dueToday)} hint="Open tasks due today" /><MetricCard title="In progress" value={formatNumber(dashboard.metrics.inProgress)} hint="Including review" /><MetricCard title="Upcoming" value={formatNumber(dashboard.metrics.upcoming)} hint="Due in the next 7 days" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"><Section title="Needs attention" description="Your highest-priority open work.">{dashboard.needsAttention.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.needsAttention} needsAttentionOnly emptyState={attentionEmptyState} /> : <AttentionEmpty />}</Section><Deadlines deadlines={dashboard.deadlines} /></div>
    <Section title="Current projects" description="Projects you are actively assigned to.">{dashboard.projects.length ? <div className="space-y-2">{dashboard.projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-3 py-3 transition hover:border-stone-300"><div><p className="font-medium text-stone-900">{project.name}</p><p className="text-sm text-stone-500">{project.project_code ?? project.client_name ?? "Active project"}</p></div><div className="text-right text-xs text-stone-500"><p>{project.openTaskCount} open · {project.inProgressCount} in progress</p><p className="mt-1">{project.nearestDueDate ? `Next due ${formatDate(project.nearestDueDate)}` : "No personal deadline"}</p></div></Link>)}</div> : <Empty message="No active project assignments." />}{dashboard.hasMoreProjects ? <Link href="/projects" className="mt-4 inline-block text-sm font-medium text-stone-900 underline">View all projects</Link> : null}</Section>
  </div>;
}

function AdminDashboard({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" }> }) {
  return <div className="space-y-6"><PageHeader title={`Welcome back, ${dashboard.profile.full_name}`} description="Studio-wide operational attention and your own assigned work." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Active projects" value={formatNumber(dashboard.metrics.activeProjects)} hint="Planned, active, or paused" /><MetricCard title="Open tasks" value={formatNumber(dashboard.metrics.openTasks)} hint="Excludes completed and cancelled" /><MetricCard title="Overdue tasks" value={formatNumber(dashboard.metrics.overdueTasks)} hint="Open work past due" /><MetricCard title="Due this week" value={formatNumber(dashboard.metrics.dueThisWeek)} hint="Today through Sunday" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"><Section title="Projects requiring attention" description="Risk-ranked active projects.">{dashboard.attentionProjects.length ? <div className="space-y-2">{dashboard.attentionProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-3 py-3 transition hover:border-stone-300"><div><p className="font-medium text-stone-900">{project.name}</p><p className="mt-1 text-sm text-stone-500">{[project.overdueCount ? `${project.overdueCount} overdue task${project.overdueCount === 1 ? "" : "s"}` : null, project.deadlineDaysAway !== null ? `Deadline ${project.deadlineDaysAway === 0 ? "today" : `in ${project.deadlineDaysAway} days`}` : null, project.urgentCount ? `${project.urgentCount} urgent task${project.urgentCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</p></div><span className="text-xs text-stone-500">{project.openTaskCount} open</span></Link>)}</div> : <Empty message="Healthy studio: no active projects need attention." />}</Section><Deadlines deadlines={dashboard.deadlines} /></div>
    <div className="grid gap-6 xl:grid-cols-2"><Section title="Team workload" description="Open assigned work across active studio members.">{dashboard.workload.length ? <div className="space-y-2">{dashboard.workload.map((member) => <div key={member.id} className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-3 py-3"><div><p className="font-medium text-stone-900">{member.full_name}</p><p className="text-sm text-stone-500">{member.job_title}</p></div><p className="text-right text-xs text-stone-600">{member.openTaskCount} open · {member.inProgressCount} in progress<br /><span className={member.overdueCount ? "font-medium text-red-700" : ""}>{member.overdueCount} overdue</span></p></div>)}</div> : <Empty message="No active studio members." />}</Section><Section title="My tasks" description="Your highest-priority assigned work.">{dashboard.myTasks.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.myTasks} /> : <Empty message="No open tasks assigned to you." />}</Section></div>
  </div>;
}

function Deadlines({ deadlines }: { deadlines: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "admin" | "employee" }> ["deadlines"] }) {
  return <Section title="Upcoming deadlines" description="The next 14 days.">{deadlines.length ? <div className="space-y-2">{deadlines.map((deadline) => <Link key={`${deadline.kind}-${deadline.id}`} href={`/projects/${deadline.project?.id ?? deadline.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-3"><div className="min-w-0"><p className="truncate font-medium text-stone-900">{deadline.title}</p><p className="text-sm text-stone-500">{deadline.kind === "task" ? `Task · ${deadline.project?.name}` : "Project deadline"}</p></div><span className="shrink-0 text-xs font-medium text-stone-600">{formatDate(deadline.dueDate)}</span></Link>)}</div> : <Empty message="No upcoming deadlines in the next 14 days." />}</Section>;
}

function Empty({ message }: { message: string }) { return <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">{message}</p>; }

const attentionEmptyState = { title: "Nothing needs immediate attention", description: "You have no overdue, urgent, or near-due tasks.", linkHref: "/my-tasks", linkLabel: "View My Tasks" };

function AttentionEmpty() { return <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center"><p className="font-medium text-stone-900">{attentionEmptyState.title}</p><p className="mt-1 text-sm text-stone-500">{attentionEmptyState.description}</p><Link href={attentionEmptyState.linkHref} className="mt-3 inline-block text-sm font-medium text-stone-900 underline">{attentionEmptyState.linkLabel}</Link></div>; }
