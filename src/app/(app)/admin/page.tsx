import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboardData, getEmployeeWorkloadData } from "@/data/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration | StudioFlow",
};

export default function AdminPage() {
  const metrics = getDashboardData();
  const workload = getEmployeeWorkloadData();

  return (
    <div className="space-y-8">
      <PageHeader title="Administration" description="Studio oversight for projects, workload, and team productivity." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active projects" value={`${metrics.activeProjectsCount}`} />
        <MetricCard title="Overdue projects" value={`${metrics.overdueProjects}`} />
        <MetricCard title="Overdue tasks" value={`${metrics.overdueTasks}`} />
        <MetricCard title="Completed tasks" value={`${metrics.completedTasksPeriod}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">Workload analytics</h2>
          <div className="mt-4 space-y-3">
            {workload.map((entry) => (
              <div key={entry.user_id} className="rounded-xl border border-stone-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-stone-900">{entry.full_name}</p>
                  <p className="text-sm text-stone-500">{entry.assigned_area_m2} m² assigned</p>
                </div>
                <p className="mt-1 text-sm text-stone-600">{entry.completed_area_m2} m² completed · {entry.open_tasks} open tasks</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">Project performance</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="font-semibold text-stone-900">Progress entry management</p>
              <p className="mt-1 text-sm text-stone-600">Administrators can record and review completed-area progress for every project.</p>
            </div>
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="font-semibold text-stone-900">Overdue work</p>
              <p className="mt-1 text-sm text-stone-600">The current MVP highlights overdue task and project concentration for review.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
