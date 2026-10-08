import { addCalendarDays, startOfMondayWeek } from "@/lib/calendar";
import type { WorkLogReminders } from "@/lib/work-log";

export type WorkLogReminder = { kind: "day" | "week"; date: string; count: number; yesterday: boolean };

export function isWorkLogReminderRelevant(reminder: WorkLogReminder, data: WorkLogReminders) {
  return reminder.kind === "week" ? data.previousWeek === reminder.date && data.previousWeekMissing.length > 0
    : data.missingDates.includes(reminder.date);
}

/** Session keys are scoped to the verified studio/user, then Kyiv day/week. */
export function takeWorkLogReminder(data: WorkLogReminders, storage: Pick<Storage, "getItem" | "setItem">): WorkLogReminder | null {
  const prefix = `studioflow:work-log:${data.scope}`;
  const dayKey = `${prefix}:day:${data.today}`, weekKey = `${prefix}:week:${startOfMondayWeek(data.today)}`;
  if (storage.getItem(dayKey)) return null;
  if (data.previousWeekMissing.length && !storage.getItem(weekKey)) {
    storage.setItem(weekKey, "1"); storage.setItem(dayKey, "1");
    return { kind: "week", date: data.previousWeek, count: data.previousWeekMissing.length, yesterday: false };
  }
  if (!data.latestEligibleDate || !data.missingDates.includes(data.latestEligibleDate)) return null;
  storage.setItem(dayKey, "1");
  return { kind: "day", date: data.latestEligibleDate, count: data.missingDates.length,
    yesterday: data.latestEligibleDate === addCalendarDays(data.today, -1) };
}
