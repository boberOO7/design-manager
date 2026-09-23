import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminDashboardView } from "@/components/dashboard/admin-dashboard";
import { DashboardSection, MetricStrip, OperationalSurface } from "@/components/dashboard/dashboard-patterns";
import { DashboardTaskList } from "@/components/tasks/dashboard-task-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboardAdministration } from "@/data/queries/dashboard-administration";
import { getDashboardOperations } from "@/data/queries/dashboard-operations";
import { getDashboard } from "@/data/queries/dashboard";
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

async function Employee({ dashboard }: { dashboard: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "employee" }> }) {
  const [t, status, locale] = await Promise.all([getTranslations("Dashboard"), getTranslations("Status"), getLocale()]);
  return <div className="space-y-8"><PageHeader title={t("welcome")} description={t("employeeIntro")} /><MetricStrip metrics={getEmployeeDashboardMetrics(dashboard.metrics)} /><div className="grid items-start gap-6 lg:grid-cols-2"><DashboardSection title={t("needsAttention")} description={t("needsAttentionDescription")}><OperationalSurface>{dashboard.needsAttention.length ? <DashboardTaskList currentUserId={dashboard.profile.id} tasks={dashboard.needsAttention} needsAttentionOnly emptyState={{ title: t("emptyEmployeeAttention"), description: t("emptyEmployeeAttentionDescription"), linkHref: "/my-tasks", linkLabel: t("viewMyTasks") }} /> : <EmptyState compact title={t("emptyEmployeeAttention")} description={t("emptyEmployeeAttentionDescription")} action={<TextLink href="/my-tasks">{t("viewMyTasks")}</TextLink>} />}</OperationalSurface></DashboardSection><Deadlines deadlines={dashboard.deadlines} /></div><DashboardSection title={t("currentProjects")} description={t("projectsDescription")}><OperationalSurface>{dashboard.projects.length ? <ul className="divide-y divide-[var(--ui-border)]">{dashboard.projects.map((project) => { const badge = getProjectLifecycleBadgeStyle(project.status); return <li key={project.id}><Link href={`/projects/${project.id}`} className="grid min-h-16 gap-2 px-3 py-3 hover:bg-[var(--ui-surface-subtle)] sm:grid-cols-[1fr_auto]"><div><p className="font-medium">{project.name}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${badge.className}`}>{status(project.status)}</span></div><div className="text-sm sm:text-right"><p className="ui-numeric">{project.progressPercent === null ? t("noTasksYet") : t("progress", { count: project.progressPercent })} · {t("openCount", { count: project.openTaskCount })}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{project.nearestDueDate ? t("nextDue", { date: formatDate(project.nearestDueDate, locale) }) : t("noPersonalDeadline")}</p></div></Link></li>; })}</ul> : <EmptyState compact title={t("emptyProjects")} />}</OperationalSurface></DashboardSection></div>;
}

async function Deadlines({ deadlines }: { deadlines: Extract<Awaited<ReturnType<typeof getDashboard>>, { kind: "employee" }>['deadlines'] }) { const [t, locale] = await Promise.all([getTranslations("Dashboard"), getLocale()]); return <DashboardSection title={t("deadlines")} description={t("deadlinesDescription")}><OperationalSurface>{deadlines.length ? <ul className="divide-y divide-[var(--ui-border)]">{deadlines.map((deadline) => <li key={`${deadline.kind}-${deadline.id}`}><Link href={getDashboardDeadlineHref(deadline)} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2.5 hover:bg-[var(--ui-surface-subtle)]"><span><b>{deadline.title}</b><small className="block text-[var(--ui-text-muted)]">{deadline.kind === "task" ? `${t("task")} · ${deadline.project?.name}` : t("projectDeadline")}</small></span><time className="ui-numeric text-xs">{formatDate(deadline.dueDate, locale)}</time></Link></li>)}</ul> : <EmptyState compact title={t("emptyDeadlines")} />}</OperationalSurface></DashboardSection>; }

function TextLink({ children, href }: { children: React.ReactNode; href: string }) { return <Link href={href} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{children}</Link>; }
