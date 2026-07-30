import { APPLICATION_TIME_ZONE, zonedWallTimeToIso } from "@/lib/calendar";

export type ProductivityAttribution = {
  contributor_id: string;
  contributor_name: string;
  contributor_job_title: string;
  credited_area_m2: number | string;
  source_type: "task" | "project_fallback";
};

export type ProductivityLeaderboardEntry = {
  rank: number;
  user_id: string;
  full_name: string;
  job_title: string;
  completed_area_m2: number;
  completed_tasks: number;
};

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

export function getKyivMonthBounds(now = new Date()): { start: string; end: string } {
  const { year, month } = kyivParts(now);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const wall = (targetYear: number, targetMonth: number) => `${targetYear}-${String(targetMonth).padStart(2, "0")}-01T00:00`;
  return { start: zonedWallTimeToIso(wall(year, month)), end: zonedWallTimeToIso(wall(nextYear, nextMonth)) };
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
