import { addCalendarDays, instantToDateOnly, instantToWallInput, parseDateOnly, zonedWallTimeToIso } from "@/lib/calendar";

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export type RecurrenceRule = { frequency: RecurrenceFrequency; interval: number; weekdays: number[]; endsOn: string | null; occurrenceCount: number | null };

export const NO_RECURRENCE: RecurrenceRule | null = null;

export function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as { frequency?: unknown; interval?: unknown; weekdays?: unknown; endsOn?: unknown; occurrenceCount?: unknown };
  if (!RECURRENCE_FREQUENCIES.includes(rule.frequency as RecurrenceFrequency) || typeof rule.interval !== "number" || !Array.isArray(rule.weekdays)) return null;
  return normalizeRecurrenceRule({ frequency: rule.frequency as RecurrenceFrequency, interval: rule.interval, weekdays: rule.weekdays.filter((day): day is number => typeof day === "number"), endsOn: typeof rule.endsOn === "string" ? rule.endsOn : null, occurrenceCount: typeof rule.occurrenceCount === "number" ? rule.occurrenceCount : null });
}

export function normalizeRecurrenceRule(value: RecurrenceRule | null): RecurrenceRule | null {
  if (!value) return null;
  return { ...value, interval: Math.max(1, Math.min(99, Math.trunc(value.interval))), weekdays: [...new Set(value.weekdays)].filter((day) => day >= 0 && day <= 6).sort(), endsOn: value.endsOn || null, occurrenceCount: value.occurrenceCount ? Math.max(1, Math.min(999, Math.trunc(value.occurrenceCount))) : null };
}

function monthsBetween(start: string, candidate: string) { const a = parseDateOnly(start); const b = parseDateOnly(candidate); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); }

export function recurrenceDates(startDate: string, rangeStart: string, rangeEnd: string, rule: RecurrenceRule): string[] {
  const normalized = normalizeRecurrenceRule(rule); if (!normalized) return [];
  const results: string[] = []; let date = startDate; let seen = 0;
  const maxEnd = normalized.endsOn && normalized.endsOn < rangeEnd ? normalized.endsOn : rangeEnd;
  while (date <= maxEnd && seen < (normalized.occurrenceCount ?? Number.MAX_SAFE_INTEGER)) {
    const day = parseDateOnly(date).getDay();
    const weeks = Math.floor((parseDateOnly(date).getTime() - parseDateOnly(startDate).getTime()) / 604800000);
    const eligible = normalized.frequency === "daily" ? Math.floor((parseDateOnly(date).getTime() - parseDateOnly(startDate).getTime()) / 86400000) % normalized.interval === 0
      : normalized.frequency === "weekly" ? weeks % normalized.interval === 0 && (normalized.weekdays.length ? normalized.weekdays.includes(day) : day === parseDateOnly(startDate).getDay())
        : normalized.frequency === "monthly" ? monthsBetween(startDate, date) % normalized.interval === 0 && parseDateOnly(date).getDate() === parseDateOnly(startDate).getDate()
          : parseDateOnly(date).getMonth() === parseDateOnly(startDate).getMonth() && parseDateOnly(date).getDate() === parseDateOnly(startDate).getDate() && (parseDateOnly(date).getFullYear() - parseDateOnly(startDate).getFullYear()) % normalized.interval === 0;
    if (eligible) { seen += 1; if (date >= rangeStart) results.push(date); }
    date = addCalendarDays(date, 1);
  }
  return results;
}

export function occurrenceBounds(startsAt: string, endsAt: string, allDay: boolean, occurrenceDate: string) {
  const startWall = instantToWallInput(startsAt); const endWall = instantToWallInput(endsAt);
  const startTime = startWall.slice(11); const endTime = endWall.slice(11);
  const daySpan = Math.round((parseDateOnly(instantToDateOnly(endsAt)).getTime() - parseDateOnly(instantToDateOnly(startsAt)).getTime()) / 86400000);
  const endDate = addCalendarDays(occurrenceDate, Math.max(0, daySpan));
  return allDay ? { startsAt: zonedWallTimeToIso(`${occurrenceDate}T00:00`), endsAt: zonedWallTimeToIso(`${addCalendarDays(endDate, 1)}T00:00`) } : { startsAt: zonedWallTimeToIso(`${occurrenceDate}T${startTime}`), endsAt: zonedWallTimeToIso(`${endDate}T${endTime}`) };
}
