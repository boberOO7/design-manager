import { parseDateOnly } from "@/lib/calendar";

export const WORKDAY_KINDS = ["day", "weekend", "studio_day_off", "time_off", "before_joining"] as const;

/** Shared studio calendar rules; callers supply applicable approved absences. */
export function getWorkdayKind(date: string, { joinedDate, timeOff = [], studioDaysOff = [] }: {
  joinedDate: string | null;
  timeOff?: readonly { start_date: string; end_date: string }[];
  studioDaysOff?: readonly string[];
}): (typeof WORKDAY_KINDS)[number] {
  if (joinedDate && date < joinedDate) return "before_joining";
  if (studioDaysOff.includes(date)) return "studio_day_off";
  if (timeOff.some(period => period.start_date <= date && period.end_date >= date)) return "time_off";
  const weekday = parseDateOnly(date).getDay();
  return weekday === 0 || weekday === 6 ? "weekend" : "day";
}
