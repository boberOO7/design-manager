import { APPLICATION_TIME_ZONE, zonedWallTimeToIso } from "@/lib/calendar";
import type { TaskStage } from "@/lib/task-stages";

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

export function allocateRemainingStageBudget(input: {
  productivityBudgetM2: number;
  allocatedProductivityM2: number;
  remainingEligibleUnsnapshottedTasks: number;
}): number {
  if (input.remainingEligibleUnsnapshottedTasks <= 0) return 0;
  return Math.max(0, input.productivityBudgetM2 - input.allocatedProductivityM2)
    / input.remainingEligibleUnsnapshottedTasks;
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

export type ProductivityLeaderboardEntry = {
  avatar_url?: string | null;
  rank: number;
  user_id: string;
  full_name: string;
  job_title: string;
  completed_area_m2: number;
  completed_tasks: number;
};

export type ProductivityLeaderboardMember = Pick<
  ProductivityLeaderboardEntry,
  "user_id" | "full_name" | "job_title" | "avatar_url"
>;

export type LeaderboardPeriod = "month" | "quarter" | "year";

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

export function getKyivMonthBounds(now = new Date(), monthOffset = 0): { start: string; end: string } {
  const { year, month } = kyivParts(now);
  const startDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const nextDate = new Date(Date.UTC(year, month + monthOffset, 1));
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth() + 1;
  const nextYear = nextDate.getUTCFullYear();
  const nextMonth = nextDate.getUTCMonth() + 1;
  const wall = (targetYear: number, targetMonth: number) => `${targetYear}-${String(targetMonth).padStart(2, "0")}-01T00:00`;
  return { start: zonedWallTimeToIso(wall(startYear, startMonth)), end: zonedWallTimeToIso(wall(nextYear, nextMonth)) };
}

export function isLeaderboardPeriod(value: string | undefined): value is LeaderboardPeriod {
  return value === "month" || value === "quarter" || value === "year";
}

export function getKyivPeriodBounds(period: LeaderboardPeriod, now = new Date(), periodOffset = 0): { start: string; end: string } {
  if (period === "month") return getKyivMonthBounds(now, periodOffset);

  const { year, month } = kyivParts(now);
  const startDate = period === "quarter"
    ? new Date(Date.UTC(year, Math.floor((month - 1) / 3) * 3 + periodOffset * 3, 1))
    : new Date(Date.UTC(year + periodOffset, 0, 1));
  const endDate = period === "quarter"
    ? new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 3, 1))
    : new Date(Date.UTC(startDate.getUTCFullYear() + 1, 0, 1));
  const wall = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01T00:00`;
  return { start: zonedWallTimeToIso(wall(startDate)), end: zonedWallTimeToIso(wall(endDate)) };
}

export function getKyivPeriodLabel(period: LeaderboardPeriod, locale: string, now = new Date(), periodOffset = 0): string {
  const { year, month } = kyivParts(now);
  if (period === "month") {
    const date = new Date(Date.UTC(year, month - 1 + periodOffset, 1));
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  if (period === "quarter") {
    const date = new Date(Date.UTC(year, Math.floor((month - 1) / 3) * 3 + periodOffset * 3, 1));
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  }
  return String(year + periodOffset);
}

export function getKyivPeriodRangeLabel(period: LeaderboardPeriod, locale: string, now = new Date()): string {
  const { year, month } = kyivParts(now);
  const start = period === "month"
    ? new Date(Date.UTC(year, month - 1, 1))
    : period === "quarter"
      ? new Date(Date.UTC(year, Math.floor((month - 1) / 3) * 3, 1))
      : new Date(Date.UTC(year, 0, 1));
  const end = period === "month"
    ? new Date(Date.UTC(year, month, 0))
    : period === "quarter"
      ? new Date(Date.UTC(year, start.getUTCMonth() + 3, 0))
      : new Date(Date.UTC(year, 11, 31));
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function filterProductivityAttributionsForPeriod(attributions: CompletedProductivityAttribution[], period: LeaderboardPeriod, now = new Date(), periodOffset = 0): ProductivityAttribution[] {
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
