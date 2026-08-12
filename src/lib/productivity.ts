import { APPLICATION_TIME_ZONE, zonedWallTimeToIso } from "@/lib/calendar";

export type ProductivityAttribution = {
  contributor_id: string;
  contributor_name: string;
  contributor_job_title: string;
  credited_area_m2: number | string;
  source_type: "task" | "project_fallback";
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

export const LEADERBOARD_BONUS_BY_RANK = {
  1: 15,
  2: 10,
  3: 5,
} as const;

export type LeaderboardBonusPercent = (typeof LEADERBOARD_BONUS_BY_RANK)[keyof typeof LEADERBOARD_BONUS_BY_RANK] | 0;

export function getLeaderboardBonusPercent(rank: number): LeaderboardBonusPercent {
  return rank in LEADERBOARD_BONUS_BY_RANK
    ? LEADERBOARD_BONUS_BY_RANK[rank as keyof typeof LEADERBOARD_BONUS_BY_RANK]
    : 0;
}

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
  completedAreaM2: number | null | undefined;
  assigneeId: string | null | undefined;
  isActiveProjectMember: boolean;
}): boolean {
  return input.completedAreaM2 === null || input.completedAreaM2 === undefined
    || (Boolean(input.assigneeId) && input.isActiveProjectMember);
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

export function getLeaderboardTotals(entries: ProductivityLeaderboardEntry[]): { completed_area_m2: number; completed_tasks: number } {
  return entries.reduce((totals, entry) => ({
    completed_area_m2: totals.completed_area_m2 + entry.completed_area_m2,
    completed_tasks: totals.completed_tasks + entry.completed_tasks,
  }), { completed_area_m2: 0, completed_tasks: 0 });
}

export function projectProductivityLeaderboard(attributions: ProductivityAttribution[]): ProductivityLeaderboardEntry[] {
  const grouped = new Map<string, Omit<ProductivityLeaderboardEntry, "rank">>();
  for (const attribution of attributions) {
    const entry = grouped.get(attribution.contributor_id) ?? { user_id: attribution.contributor_id, full_name: attribution.contributor_name, job_title: attribution.contributor_job_title, completed_area_m2: 0, completed_tasks: 0 };
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
