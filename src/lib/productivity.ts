import { APPLICATION_TIME_ZONE, zonedWallTimeToIso } from "@/lib/calendar";
import type { TaskStage } from "@/lib/task-stages";
import { isTaskFinished } from "@/lib/tasks";

export const PRODUCTIVITY_STAGE_RATIOS = {
  stage_1: 0.20,
  stage_3: 0.80,
} as const satisfies Partial<Record<TaskStage, number>>;

export type ProductivityStageMode = "project_area_ratio" | "task_area" | "none";
export type TaskCreationProgressField = "area" | "weight" | null;

export function getProductivityStageMode(stage: TaskStage): ProductivityStageMode {
  if (stage === "stage_2") return "task_area";
  return stage in PRODUCTIVITY_STAGE_RATIOS ? "project_area_ratio" : "none";
}

/** Maps the canonical productivity stage mode to the one editable task value. */
export function getTaskCreationProgressField(stage: TaskStage): TaskCreationProgressField {
  const mode = getProductivityStageMode(stage);
  if (mode === "task_area") return "area";
  if (mode === "project_area_ratio") return "weight";
  return null;
}

export function doesTaskCompletionRequireProductivityAttribution(input: {
  stage: TaskStage;
  completedAreaM2: number | null | undefined;
  projectAreaM2: number | null | undefined;
}): boolean {
  const mode = getProductivityStageMode(input.stage);
  if (mode === "task_area") return Number(input.completedAreaM2 ?? 0) > 0;
  if (mode === "project_area_ratio") return Number(input.projectAreaM2 ?? 0) > 0;
  return false;
}

export function getProductivityWorkloadAreaByTask(
  tasks: ReadonlyArray<{ id: string; project_id: string; stage: TaskStage; status: string; assignee_id: string | null; completed_area_m2: number | null; productivity_area_m2: number | null }>,
  projects: ReadonlyArray<{ id: string; total_area_m2: number | null; include_in_productivity: boolean }>,
  activeAssignments: ReadonlySet<string>,
): Map<string, number> {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const eligibleCounts = new Map<string, number>();
  for (const task of tasks) {
    if (getProductivityStageMode(task.stage) !== "project_area_ratio" || task.status === "cancelled") continue;
    const key = `${task.project_id}:${task.stage}`;
    eligibleCounts.set(key, (eligibleCounts.get(key) ?? 0) + 1);
  }
  const areas = new Map<string, number>();
  for (const task of tasks) {
    const project = projectsById.get(task.project_id);
    if (!project?.include_in_productivity || !task.assignee_id || !activeAssignments.has(`${task.project_id}:${task.assignee_id}`) || isTaskFinished(task.status)) continue;
    const mode = getProductivityStageMode(task.stage);
    if (mode === "none") continue;
    const area = mode === "task_area"
      ? Number(task.productivity_area_m2 ?? task.completed_area_m2 ?? 0)
      : Math.max(0, Number(project.total_area_m2 ?? 0))
        * (task.stage === "stage_1" ? PRODUCTIVITY_STAGE_RATIOS.stage_1 : PRODUCTIVITY_STAGE_RATIOS.stage_3)
        / (eligibleCounts.get(`${task.project_id}:${task.stage}`) ?? 1);
    if (area > 0) areas.set(task.id, area);
  }
  return areas;
}

export type ProductivityAttribution = {
  contributor_id: string;
  contributor_name: string;
  contributor_job_title: string;
  credited_area_m2: number | string;
  source_type: "task" | "project_fallback";
  task_stage?: TaskStage | null;
};

export type CompletedProductivityAttribution = ProductivityAttribution & { completed_at: string };

export type ProductivityContributionAttribution = CompletedProductivityAttribution & {
  id: string;
  project_id: string;
  task_id: string | null;
};

export type ProductivityProjectContribution = {
  project_id: string;
  project_name: string | null;
  completed_area_m2: number;
  records: Array<{
    id: string;
    task_title: string | null;
    task_stage: TaskStage | null;
    source_type: ProductivityAttribution["source_type"];
    completed_at: string;
    credited_area_m2: number;
  }>;
};

export type ProductivityLeaderboardEntry = {
  avatar_url?: string | null;
  rank: number;
  user_id: string;
  full_name: string;
  job_title: string;
  completed_area_m2: number;
  completed_tasks: number;
};

export function selectPersonalDashboardProductivity(entries: ProductivityLeaderboardEntry[], userId: string, showRank: boolean) {
  const own = entries.find((entry) => entry.user_id === userId);
  return showRank ? { areaM2: own?.completed_area_m2 ?? 0, rank: own?.rank ?? null } : { areaM2: own?.completed_area_m2 ?? 0 };
}

export type ProductivityLeaderboardMember = Pick<
  ProductivityLeaderboardEntry,
  "user_id" | "full_name" | "job_title" | "avatar_url"
>;

export type LeaderboardPeriodMode = "month" | "quarter" | "year" | "custom";
export type LeaderboardMonthRange = { from: string; through: string };
export type LeaderboardPeriod = Exclude<LeaderboardPeriodMode, "custom"> | LeaderboardMonthRange;

export type ProjectAttributionMode = "project_fallback" | "task_level";

export function getProjectAttributionMode(tasks: ReadonlyArray<{ completed_area_m2?: number | null }>): ProjectAttributionMode {
  return tasks.some((task) => task.completed_area_m2 !== null && task.completed_area_m2 !== undefined)
    ? "task_level"
    : "project_fallback";
}

export function isEligibleProjectFallbackContributor(input: {
  hasActiveProjectMembership: boolean;
  hasActiveStudioMembership: boolean;
  hasActiveProfile: boolean;
}): boolean {
  return input.hasActiveProjectMembership && input.hasActiveStudioMembership && input.hasActiveProfile;
}

export function canCompleteAttributedTask(input: {
  requiresProductivityAttribution: boolean;
  assigneeId: string | null | undefined;
  isActiveProjectMember: boolean;
}): boolean {
  if (!input.requiresProductivityAttribution || input.assigneeId === null || input.assigneeId === undefined) return true;
  return input.isActiveProjectMember;
}

function kyivParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APPLICATION_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  return { year: Number(parts.find((part) => part.type === "year")?.value), month: Number(parts.find((part) => part.type === "month")?.value) };
}

export function parseLeaderboardMonthRange(from: unknown, through: unknown): LeaderboardMonthRange | null {
  const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
  return typeof from === "string" && typeof through === "string" && monthPattern.test(from) && monthPattern.test(through) && from <= through
    ? { from, through }
    : null;
}

export function isLeaderboardPeriod(value: unknown): value is Exclude<LeaderboardPeriodMode, "custom"> {
  return value === "month" || value === "quarter" || value === "year";
}

export function resolveLeaderboardPeriod(params: { period?: string | string[]; from?: string | string[]; through?: string | string[] }, now = new Date()): LeaderboardPeriod {
  if (params.period === "custom") return parseLeaderboardMonthRange(params.from, params.through) ?? getLeaderboardMonthRange("month", now);
  return isLeaderboardPeriod(params.period) ? params.period : "month";
}

function periodMonthDates(period: LeaderboardPeriod, now: Date, periodOffset = 0): { start: Date; end: Date } {
  let start: Date;
  let monthCount: number;
  if (typeof period === "string") {
    const { year, month } = kyivParts(now);
    monthCount = period === "month" ? 1 : period === "quarter" ? 3 : 12;
    start = new Date(Date.UTC(year, Math.floor((month - 1) / monthCount) * monthCount, 1));
  } else {
    start = new Date(`${period.from}-01T00:00:00.000Z`);
    const [endYear, endMonth] = period.through.split("-").map(Number);
    monthCount = (endYear - start.getUTCFullYear()) * 12 + endMonth - start.getUTCMonth();
  }
  start.setUTCMonth(start.getUTCMonth() + periodOffset * monthCount);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + monthCount);
  return { start, end };
}

export function getLeaderboardMonthRange(period: LeaderboardPeriod, now = new Date(), periodOffset = 0): LeaderboardMonthRange {
  const { start, end } = periodMonthDates(period, now, periodOffset);
  end.setUTCMonth(end.getUTCMonth() - 1);
  return { from: start.toISOString().slice(0, 7), through: end.toISOString().slice(0, 7) };
}

export function getKyivMonthBounds(now = new Date(), monthOffset = 0): { start: string; end: string } {
  return getKyivPeriodBounds("month", now, monthOffset);
}

export function getKyivPeriodBounds(period: LeaderboardPeriod, now = new Date(), periodOffset = 0): { start: string; end: string } {
  const { start, end } = periodMonthDates(period, now, periodOffset);
  const wall = (date: Date) => `${date.toISOString().slice(0, 10)}T00:00`;
  return { start: zonedWallTimeToIso(wall(start)), end: zonedWallTimeToIso(wall(end)) };
}

export function getKyivPeriodLabel(period: LeaderboardPeriod, locale: string, now = new Date(), periodOffset = 0): string {
  const { start, end } = periodMonthDates(period, now, periodOffset);
  if (period === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  }
  if (period === "quarter") {
    return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
  }
  if (period === "year") return String(start.getUTCFullYear());
  end.setUTCMonth(end.getUTCMonth() - 1);
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const label = (date: Date) => `${formatter.format(date).replace(/\.$/u, "")} ${date.getUTCFullYear()}`;
  return `${label(start)} – ${label(end)}`;
}

export function getKyivPeriodRangeLabel(period: LeaderboardPeriod, locale: string, now = new Date()): string {
  const { start, end } = periodMonthDates(period, now);
  end.setUTCDate(0);
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function filterProductivityAttributionsForPeriod<T extends CompletedProductivityAttribution>(attributions: T[], period: LeaderboardPeriod, now = new Date(), periodOffset = 0): T[] {
  const bounds = getKyivPeriodBounds(period, now, periodOffset);
  return attributions.filter((attribution) => attribution.completed_at >= bounds.start && attribution.completed_at < bounds.end);
}

export function getLeaderboardTotals(entries: ProductivityLeaderboardEntry[]): { completed_area_m2: number; completed_tasks: number } {
  return entries.reduce((totals, entry) => ({
    completed_area_m2: totals.completed_area_m2 + entry.completed_area_m2,
    completed_tasks: totals.completed_tasks + entry.completed_tasks,
  }), { completed_area_m2: 0, completed_tasks: 0 });
}

export function hasQualifyingProductivity(entry: Pick<ProductivityLeaderboardEntry, "completed_area_m2" | "completed_tasks">): boolean {
  return entry.completed_area_m2 > 0 || entry.completed_tasks > 0;
}

export function projectProductivityLeaderboard(
  attributions: ProductivityAttribution[],
  eligibleMembers?: ProductivityLeaderboardMember[],
): ProductivityLeaderboardEntry[] {
  const grouped = new Map<string, Omit<ProductivityLeaderboardEntry, "rank">>();
  for (const member of eligibleMembers ?? []) {
    grouped.set(member.user_id, {
      user_id: member.user_id,
      full_name: member.full_name,
      job_title: member.job_title,
      avatar_url: member.avatar_url ?? null,
      completed_area_m2: 0,
      completed_tasks: 0,
    });
  }
  for (const attribution of attributions) {
    const existingEntry = grouped.get(attribution.contributor_id);
    if (eligibleMembers && !existingEntry) continue;
    const entry = existingEntry ?? {
      user_id: attribution.contributor_id,
      full_name: attribution.contributor_name,
      job_title: attribution.contributor_job_title,
      completed_area_m2: 0,
      completed_tasks: 0,
    };
    entry.completed_area_m2 += Number(attribution.credited_area_m2);
    if (attribution.source_type === "task") entry.completed_tasks += 1;
    grouped.set(attribution.contributor_id, entry);
  }
  const ordered = [...grouped.values()].sort((left, right) => right.completed_area_m2 - left.completed_area_m2 || right.completed_tasks - left.completed_tasks || left.full_name.localeCompare(right.full_name) || left.user_id.localeCompare(right.user_id));
  let previous: Omit<ProductivityLeaderboardEntry, "rank"> | null = null;
  let rank = 0;
  return ordered.map((entry, index) => {
    if (!previous || previous.completed_area_m2 !== entry.completed_area_m2 || previous.completed_tasks !== entry.completed_tasks) rank = index + 1;
    previous = entry;
    return { ...entry, rank };
  });
}

/** Keep task attribution eligibility intact while excluding only configured project area. */
export function selectLeaderboardAttributions<T extends ProductivityAttribution & { project_id: string }>(
  attributions: T[], excludedProjectIds: ReadonlySet<string>,
): T[] {
  return attributions.map((attribution) => excludedProjectIds.has(attribution.project_id)
    ? { ...attribution, credited_area_m2: 0 }
    : attribution);
}

export function projectProductivityContributions(
  attributions: ProductivityContributionAttribution[],
  eligibleMembers: ProductivityLeaderboardMember[],
  projectNames: ReadonlyMap<string, string>,
  taskTitles: ReadonlyMap<string, string>,
): Record<string, ProductivityProjectContribution[]> {
  const eligibleIds = new Set(eligibleMembers.map((member) => member.user_id));
  const byMember = new Map<string, Map<string, ProductivityProjectContribution>>();
  for (const attribution of attributions) {
    const area = Number(attribution.credited_area_m2);
    if (!eligibleIds.has(attribution.contributor_id) || area === 0) continue;
    const projects = byMember.get(attribution.contributor_id) ?? new Map<string, ProductivityProjectContribution>();
    const project = projects.get(attribution.project_id) ?? {
      project_id: attribution.project_id,
      project_name: projectNames.get(attribution.project_id) ?? null,
      completed_area_m2: 0,
      records: [],
    };
    project.completed_area_m2 += area;
    project.records.push({
      id: attribution.id,
      task_title: attribution.task_id ? taskTitles.get(attribution.task_id) ?? null : null,
      task_stage: attribution.task_stage ?? null,
      source_type: attribution.source_type,
      completed_at: attribution.completed_at,
      credited_area_m2: area,
    });
    projects.set(attribution.project_id, project);
    byMember.set(attribution.contributor_id, projects);
  }
  return Object.fromEntries([...byMember].map(([memberId, projects]) => [memberId, [...projects.values()]]));
}
