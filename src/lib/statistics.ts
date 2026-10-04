import type { Database } from "@/types/database.types";
import type { ProductivityContributionAttribution } from "@/lib/productivity";
import { getKyivDateOnly } from "@/lib/validation/project";

type Tables = Database["public"]["Tables"];
export type StatisticsProject = Pick<Tables["projects"]["Row"], "id" | "name" | "status" | "archived_at" | "completed_at" | "include_in_productivity" | "total_area_m2">;
export type StatisticsTask = Pick<Tables["tasks"]["Row"], "id" | "project_id" | "completed_at">;
export type StatisticsActivity = Pick<Tables["project_activity"]["Row"], "project_id" | "changes" | "created_at">;
export const statisticsPeriods = ["3", "6", "12", "year", "all"] as const;
export type StatisticsPeriod = typeof statisticsPeriods[number];
export const statisticsSections = ["overview", "leads", "team", "calendar"] as const;
export type StatisticsSection = typeof statisticsSections[number];
export function parseStatisticsSection(value: string | string[] | undefined): StatisticsSection {
  return statisticsSections.find(section => section === value) ?? "overview";
}
export type StatisticsSources = {
  projects: StatisticsProject[];
  tasks: StatisticsTask[];
  activities: StatisticsActivity[];
  attributions: ProductivityContributionAttribution[];
};

const DAY = 86_400_000;
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
const first = (dates: string[]) => dates.sort()[0] ?? null;
const inRange = (date: string | null, from: string, through: string): date is string => date !== null && date >= from && date <= through;

export function parseStatisticsPeriod(value: string | string[] | undefined): StatisticsPeriod {
  return statisticsPeriods.find(period => period === value) ?? "12";
}

export function statisticsRange(period: StatisticsPeriod, today: string, availableFrom: string | null) {
  const [year, month] = today.split("-").map(Number);
  const from = period === "all" ? monthOf(availableFrom ?? today)
    : period === "year" ? `${year}-01-01`
      : new Date(Date.UTC(year, month - Number(period), 1)).toISOString().slice(0, 10);
  return { from, through: today };
}

/** Real activation evidence, never planned start_date / updated_at. Pauses remain included.
 * The first logged status change must itself be a start, so a legacy resume or
 * reopened completion is not mistaken for initial activation. Completion-date
 * corrections remain authoritative; contradictory chronology is excluded.
 */
function projectTransitions(projectId: string, activities: StatisticsActivity[]) {
  return activities.filter(activity => activity.project_id === projectId).flatMap(activity => {
    const changes = activity.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Number.isFinite(Date.parse(activity.created_at))) return [];
    const status = changes.status;
    if (!status || typeof status !== "object" || Array.isArray(status) || typeof status.from !== "string" || typeof status.to !== "string") return [];
    return [{ from: status.from, to: status.to, timestamp: activity.created_at, date: getKyivDateOnly(new Date(activity.created_at)) }];
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function recordedProjectStart(projectId: string, activities: StatisticsActivity[], through: string, tasks: StatisticsTask[] = []) {
  const start = projectTransitions(projectId, activities)[0];
  if (start?.from !== "planned" || start.to !== "active" || start.date > through) return null;
  return tasks.some(task => task.project_id === projectId && task.completed_at && task.completed_at < start.date) ? null : start;
}

export function recordedProjectDuration(project: StatisticsProject, activities: StatisticsActivity[], today: string, tasks: StatisticsTask[] = []) {
  if (!["completed", "archived"].includes(project.status) || !project.completed_at || project.completed_at > today || !Number.isFinite(Date.parse(project.completed_at))) return null;
  const start = recordedProjectStart(project.id, activities, project.completed_at, tasks);
  if (!start) return null;
  // completed_at is the authoritative, admin-correctable completion date. A
  // second audit record is not required to prove an already recorded completion.
  return { id: project.id, name: project.name, started: start.date, completed: project.completed_at,
    days: Math.round((Date.parse(project.completed_at) - Date.parse(start.date)) / DAY) };
}

export function recordedProjectAge(project: StatisticsProject, activities: StatisticsActivity[], today: string, tasks: StatisticsTask[] = []) {
  if (!["active", "paused"].includes(project.status) || project.archived_at || project.completed_at) return null;
  const start = recordedProjectStart(project.id, activities, today, tasks);
  return start ? { id: project.id, name: project.name, status: project.status, started: start.date,
    days: Math.round((Date.parse(today) - Date.parse(start.date)) / DAY) } : null;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildStatistics(sources: StatisticsSources, period: StatisticsPeriod, today: string, sharedFrom?: string) {
  const projects = new Map(sources.projects.map(project => [project.id, project]));
  const production = [...projects.values()].filter(project => project.include_in_productivity);
  const completed = production.filter(project => (project.status === "completed" || project.status === "archived") && project.completed_at && project.completed_at <= today);
  const tasks = [...new Map(sources.tasks.map(task => [task.id, task])).values()].filter(task => projects.get(task.project_id)?.include_in_productivity && task.completed_at && task.completed_at <= today);
  const taskDates = new Map(tasks.map(task => [task.id, task.completed_at]));
  const retainedTasks = new Map(sources.tasks.map(task => [task.id, task]));
  let excludedCredits = 0;
  const attributions = [...new Map(sources.attributions.map(row => [row.id, row])).values()].filter(row => {
    if (projects.get(row.project_id)?.include_in_productivity === false) return false;
    const date = getKyivDateOnly(new Date(row.completed_at));
    if (date > today) return false;
    // Legacy stage backfill sometimes used task.created_at when completed_at
    // was absent. Such rows are not evidence for a dated production trend.
    // Deleted tasks/projects retain canonical non-voided snapshot credit. For
    // retained tasks, reject legacy fallback dates contradicted by the source.
    const retainedTask = row.task_id ? retainedTasks.get(row.task_id) : undefined;
    const reliable = row.source_type === "task" ? !retainedTask || taskDates.get(retainedTask.id) === date
      : !projects.has(row.project_id) || projects.get(row.project_id)?.completed_at === date;
    if (!reliable) excludedCredits += 1;
    return reliable;
  });
  const completionFrom = first(completed.flatMap(project => project.completed_at ? [project.completed_at] : []));
  const creditFrom = first(attributions.map(row => getKyivDateOnly(new Date(row.completed_at))));
  const taskFrom = first(tasks.flatMap(task => task.completed_at ? [task.completed_at] : []));
  const availableFrom = first([completionFrom, creditFrom, taskFrom].filter(date => date !== null));
  const range = sharedFrom ? { from: sharedFrom, through: today } : statisticsRange(period, today, availableFrom);
  const months: Array<{ month: string; completedProjects: number | null; physicalArea: number | null; creditedArea: number | null; completedTasks: number | null; durationMedian: number | null }> = [];
  for (let cursor = range.from; cursor <= today;) {
    const has = (coverage: string | null) => coverage !== null && cursor >= monthOf(coverage);
    months.push({ month: cursor, completedProjects: has(completionFrom) ? 0 : null, physicalArea: has(completionFrom) ? 0 : null,
      creditedArea: has(creditFrom) ? 0 : null, completedTasks: has(taskFrom) ? 0 : null, durationMedian: null });
    const [year, month] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }
  const byMonth = new Map(months.map(month => [month.month, month]));
  const selectedProjects = completed.filter(project => inRange(project.completed_at, range.from, today));
  for (const project of selectedProjects) {
    const bucket = byMonth.get(monthOf(project.completed_at ?? ""));
    if (bucket) { bucket.completedProjects = (bucket.completedProjects ?? 0) + 1; bucket.physicalArea = (bucket.physicalArea ?? 0) + project.total_area_m2; }
  }
  const contributors = new Set<string>();
  for (const row of attributions) {
    const bucket = byMonth.get(monthOf(getKyivDateOnly(new Date(row.completed_at))));
    if (bucket) {
      bucket.creditedArea = (bucket.creditedArea ?? 0) + Number(row.credited_area_m2);
      if (Number(row.credited_area_m2) > 0) contributors.add(row.contributor_id);
    }
  }
  for (const task of tasks) {
    const bucket = byMonth.get(monthOf(task.completed_at ?? ""));
    if (bucket) bucket.completedTasks = (bucket.completedTasks ?? 0) + 1;
  }
  const durations = selectedProjects.flatMap(project => {
    const duration = recordedProjectDuration(project, sources.activities, today, sources.tasks);
    return duration ? [duration] : [];
  }).sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
  const ongoingProjects = production.filter(project => ["active", "paused"].includes(project.status) && !project.archived_at && !project.completed_at);
  const ongoing = ongoingProjects.flatMap(project => {
    const age = recordedProjectAge(project, sources.activities, today, sources.tasks);
    return age ? [age] : [];
  }).sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
  for (const month of months) month.durationMedian = median(durations.filter(project => monthOf(project.completed) === month.month).map(project => project.days));

  const total = (key: "completedProjects" | "physicalArea" | "creditedArea" | "completedTasks") => months.some(month => month[key] !== null)
    ? months.reduce((sum, month) => sum + (month[key] ?? 0), 0) : null;
  return { period, today, ...range, months, durations, ongoing,
    totals: { completedProjects: total("completedProjects"), physicalArea: total("physicalArea"), creditedArea: total("creditedArea"), completedTasks: total("completedTasks"),
      contributors: creditFrom && creditFrom <= today && creditFrom <= range.through ? contributors.size : null,
      activeProjects: production.filter(project => project.status === "active" && !project.archived_at).length,
      medianAge: median(ongoing.map(project => project.days)),
      medianDays: median(durations.map(project => project.days)), meanDays: durations.length ? durations.reduce((sum, project) => sum + project.days, 0) / durations.length : null },
    coverage: { completionFrom, creditFrom, taskFrom, excludedCredits,
      missingCompletionDates: production.filter(project => project.status === "completed" && !project.completed_at).length,
      durationProjects: durations.length, selectedProjects: selectedProjects.length, ongoingProjects: ongoingProjects.length } };
}

export type StatisticsReport = ReturnType<typeof buildStatistics>;
