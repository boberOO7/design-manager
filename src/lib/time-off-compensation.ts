export const DEFAULT_WORKDAY_MINUTES = 8 * 60;

export type CompensableDayOff = {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
};

export type WorkMakeupContribution = {
  id: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  cancelledAt: string | null;
  compensatesTimeOffRequestId: string | null;
};

function calendarDayCount(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(Math.floor((end - start) / 86_400_000) + 1, 0);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getRequiredDayOffMinutes(dayOff: CompensableDayOff): number {
  if (dayOff.allDay) return calendarDayCount(dayOff.startDate, dayOff.endDate) * DEFAULT_WORKDAY_MINUTES;
  if (!dayOff.startTime || !dayOff.endTime) return 0;
  return Math.max(timeToMinutes(dayOff.endTime) - timeToMinutes(dayOff.startTime), 0);
}

export function getWorkMakeupMinutes(event: Pick<WorkMakeupContribution, "startsAt" | "endsAt" | "allDay">): number {
  if (event.allDay) return DEFAULT_WORKDAY_MINUTES;
  return Math.max(Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000), 0);
}

export function getDayOffCompensation(dayOff: CompensableDayOff, events: WorkMakeupContribution[]) {
  const requiredMinutes = getRequiredDayOffMinutes(dayOff);
  const seenEventIds = new Set<string>();
  const compensatedMinutes = events
    .filter((event) => {
      if (seenEventIds.has(event.id)) return false;
      seenEventIds.add(event.id);
      return event.compensatesTimeOffRequestId === dayOff.id && event.cancelledAt === null;
    })
    .reduce((total, event) => total + getWorkMakeupMinutes(event), 0);
  return { requiredMinutes, compensatedMinutes, remainingMinutes: Math.max(requiredMinutes - compensatedMinutes, 0) };
}
