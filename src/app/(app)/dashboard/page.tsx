import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile, getDashboardData, getLeaderboardData, getProjectsData, getMyTasksData } from "@/data/queries";
import { formatDate, formatNumber, getProgressPercentage } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | StudioFlow",
};

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return (
      <div className="space-y-8">
        <PageHeader title="Dashboard" description="Please log in to view your dashboard." />
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">You must be logged in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const metrics = getDashboardData();
  const projects = getProjectsData();
  const tasks = getMyTasksData();
  const leaderboard = getLeaderboardData();

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${profile.full_name}`} description="A focused view of active studio delivery, task health, and team productivity." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active projects" value={formatNumber(metrics.activeProjectsCount)} hint="Currently in motion" />
        <MetricCard title="Active area" value={`${formatNumber(metrics.activeTotalArea)} m²`} hint="Assigned workload in motion" />
        <MetricCard title="Completed area" value={`${formatNumber(metrics.completedArea)} m²`} hint="Audit-ready progress entries" />
        <MetricCard title="Overdue tasks" value={formatNumber(metrics.overdueTasks)} hint="Needs attention" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Your active projects</h2>
              <p className="text-sm text-stone-500">Projects currently linked to your delivery role.</p>
            </div>
          </div>
          <div className="space-y-3">
            {projects.slice(0, 3).map((project) => (
              <div key={project.id} className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-stone-900">{project.name}</p>
                    <p className="text-sm text-stone-500">{project.project_code}</p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{project.status}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-stone-900" style={{ width: `${getProgressPercentage(project.total_area_m2, project.completed_area_m2)}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-stone-500">
                  <span>{project.completed_area_m2} m² completed</span>
                  <span>{formatDate(project.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Your tasks</h2>
              <p className="text-sm text-stone-500">Open work assigned to you.</p>
            </div>
          </div>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-stone-200 p-3">
                <p className="font-medium text-stone-900">{task.title}</p>
                <p className="mt-1 text-sm text-stone-500">{task.project_name}</p>
                <div className="mt-2 flex items-center justify-between text-sm text-stone-500">
                  <span>{task.status}</span>
                  <span>{formatDate(task.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Current leaderboard</h2>
            <p className="text-sm text-stone-500">Neutral monthly productivity across the studio team.</p>
          </div>
        </div>
        <div className="space-y-3">
          {leaderboard.map((entry) => (
            <div key={entry.user_id} className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3">
              <div>
                <p className="font-semibold text-stone-900">#{entry.rank} {entry.full_name}</p>
                <p className="text-sm text-stone-500">{entry.job_title}</p>
              </div>
              <div className="text-sm text-stone-600">
                <span className="font-semibold text-stone-900">{entry.completed_area_m2} m²</span> · {entry.completed_tasks} tasks
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
