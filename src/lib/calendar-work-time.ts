import { addCalendarDays, zonedWallTimeToIso } from "./calendar";
import { materializeStatisticsEvents, STATISTICS_CALENDAR_TYPES, type StatisticsCalendarEvent, type StatisticsCalendarOccurrence } from "./statistics-calendar";
import { DEFAULT_WORKDAY_MINUTES } from "./time-off-compensation";
import { getWorkdayKind } from "./workdays";

type WorkdayContext = Parameters<typeof getWorkdayKind>[1];

/** Work time differs from Calendar's duration report: a full working day is 8h,
 * while makeup is a commitment to log work, not evidence of work performed. */
export function summarizeDailyCalendarWork(events: StatisticsCalendarOccurrence[], date: string, now: string,
  eligibility: WorkdayContext = { joinedDate: null }) {
  const start = Date.parse(zonedWallTimeToIso(`${date}T00:00`));
  const end = Date.parse(zonedWallTimeToIso(`${addCalendarDays(date, 1)}T00:00`));
  const nowMs = Date.parse(now);
  const items: Array<{ event: StatisticsCalendarOccurrence; minutes: number }> = [];
  const spans: Array<{ start: number; end: number }> = [];
  let allDayMinutes = 0;
  for (const event of events) {
    if (event.event_type === "work_makeup") continue;
    const from = Math.max(start, Date.parse(event.starts_at));
    const through = Math.min(end, Date.parse(event.ends_at));
    if (!(through > from)) continue;
    if (event.all_day) {
      if (end > nowMs || getWorkdayKind(date, eligibility) !== "day") continue;
      allDayMinutes = DEFAULT_WORKDAY_MINUTES;
      items.push({ event, minutes: DEFAULT_WORKDAY_MINUTES });
    } else if (Date.parse(event.ends_at) <= nowMs) {
      spans.push({ start: from, end: through });
      items.push({ event, minutes: (through - from) / 60_000 });
    }
  }
  let timedMinutes = 0, coveredUntil = 0;
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    timedMinutes += Math.max(0, span.end - Math.max(span.start, coveredUntil)) / 60_000;
    coveredUntil = Math.max(coveredUntil, span.end);
  }
  // A full-day commitment already covers the day's timed calendar activities.
  const minutes = Math.max(allDayMinutes, timedMinutes);
  const categories = STATISTICS_CALENDAR_TYPES.flatMap(eventType => {
    const matches = items.filter(item => item.event.event_type === eventType);
    return matches.length ? [{ eventType, minutes: matches.reduce((sum, item) => sum + item.minutes, 0),
      allDayCount: matches.filter(item => item.event.all_day).length }] : [];
  });
  return { minutes, categories, items };
}

export function getWorkMakeupDates(events: StatisticsCalendarEvent[], userId: string, range: { from: string; through: string }) {
  const dates = new Set<string>();
  for (const event of materializeStatisticsEvents(events, range)) {
    if (event.event_type !== "work_makeup" || event.organizer_id !== userId) continue;
    for (let date = range.from; date <= range.through; date = addCalendarDays(date, 1)) {
      const start = Date.parse(zonedWallTimeToIso(`${date}T00:00`));
      const end = Date.parse(zonedWallTimeToIso(`${addCalendarDays(date, 1)}T00:00`));
      if (Math.min(end, Date.parse(event.ends_at)) > Math.max(start, Date.parse(event.starts_at))) dates.add(date);
    }
  }
  return [...dates];
}
