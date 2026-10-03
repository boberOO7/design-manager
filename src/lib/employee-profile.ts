import { addCalendarDays, APPLICATION_TIME_ZONE, instantToDateOnly, parseDateOnly, startOfMondayWeek } from "@/lib/calendar";
import { filterProductivityAttributionsForPeriod, getKyivMonthBounds, projectProductivityLeaderboard, type ProductivityContributionAttribution } from "@/lib/productivity";
import type { Database } from "@/types/database.types";

export function getProfileActivityBounds(now = new Date()) {
  const today = instantToDateOnly(now.toISOString());
  return { start: addCalendarDays(startOfMondayWeek(today), -51 * 7), today };
}

export function getProfileJoinedDate(joinedAt: string | null): string | null {
  return joinedAt && Number.isFinite(new Date(joinedAt).getTime()) ? instantToDateOnly(joinedAt) : null;
}

export function buildProfileHeatmap({ tasks, joinedAt, timeOff = [], studioDaysOff = [], now = new Date() }: {
  tasks: readonly Pick<Database["public"]["Tables"]["tasks"]["Row"], "id" | "completed_at">[];
  joinedAt: string | null;
  timeOff?: readonly Pick<Database["public"]["Tables"]["time_off_requests"]["Row"], "start_date" | "end_date">[];
  studioDaysOff?: readonly string[];
  now?: Date;
}) {
  const { start, today } = getProfileActivityBounds(now);
  const joinedDate = getProfileJoinedDate(joinedAt);
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const task of tasks) {
    // completed_at is an authoritative DATE, never updated_at or an inferred instant.
    const day = task.completed_at;
    if (!day || seen.has(task.id) || day < start || day > today || (joinedDate && day < joinedDate)) continue;
    seen.add(task.id);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const daysOff = new Set(studioDaysOff);
  const days = Array.from({ length: 52 * 7 }, (_, index) => {
    const date = addCalendarDays(start, index);
    const count = counts.get(date) ?? 0;
    const weekday = parseDateOnly(date).getDay();
    const kind = date > today ? "future"
      : joinedDate && date < joinedDate ? "before_joining"
      : daysOff.has(date) ? "studio_day_off"
      : timeOff.some((period) => period.start_date <= date && period.end_date >= date) ? "time_off"
      : weekday === 0 || weekday === 6 ? "weekend" : "day";
    return { date, count, kind, level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4 };
  });
  return {
    start, end: today, total: [...counts.values()].reduce((sum, count) => sum + count, 0),
    weeks: Array.from({ length: 52 }, (_, index) => days.slice(index * 7, index * 7 + 7)),
  };
}

export type ProfileHeatmap = ReturnType<typeof buildProfileHeatmap>;

export function summarizeProfileContributions(attributions: ProductivityContributionAttribution[], userId: string, now = new Date()) {
  // PostgREST timestamps can use +00:00; canonical period helpers compare ISO strings.
  const own = attributions.filter((record) => record.contributor_id === userId)
    .map((record) => ({ ...record, completed_at: new Date(record.completed_at).toISOString() }));
  const summarize = (records: ProductivityContributionAttribution[]) => {
    const entry = projectProductivityLeaderboard(records)[0];
    return { areaM2: entry?.completed_area_m2 ?? 0, completedTasks: entry?.completed_tasks ?? 0 };
  };
  return {
    ...summarize(own),
    history: Array.from({ length: 6 }, (_, index) => {
      const offset = index - 5;
      return { start: getKyivMonthBounds(now, offset).start, ...summarize(filterProductivityAttributionsForPeriod(own, "month", now, offset)) };
    }),
  };
}

export function getCompletedTenureMonths(joinedAt: string | null, now = new Date()): number | null {
  const joinedDate = getProfileJoinedDate(joinedAt);
  if (!joinedDate) return null;
  const start = new Date(`${joinedDate}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en", { timeZone: APPLICATION_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const months = (part("year") - start.getUTCFullYear()) * 12 + part("month") - 1 - start.getUTCMonth()
    - (part("day") < start.getUTCDate() ? 1 : 0);
  return months < 0 ? null : months;
}
