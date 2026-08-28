import { addCalendarDays } from "./calendar";

export type CalendarFormRangeValues = {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

const MINUTES_PER_DAY = 24 * 60;

function keepTimedRangeValid(values: CalendarFormRangeValues): CalendarFormRangeValues {
  if (values.allDay || values.endDate > values.startDate || values.endTime > values.startTime) return values;
  return { ...values, endDate: addCalendarDays(values.startDate, 1) };
}

function getCalendarDateDifference(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / (1000 * 60 * 60 * 24);
}

function getTimeInMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function addWallMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const totalMinutes = getTimeInMinutes(time) + minutes;
  const dateOffset = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const timeInDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = String(Math.floor(timeInDay / 60)).padStart(2, "0");
  const minute = String(timeInDay % 60).padStart(2, "0");
  return { date: addCalendarDays(date, dateOffset), time: `${hour}:${minute}` };
}

function getTimedDurationInMinutes(values: CalendarFormRangeValues): number {
  const duration = getCalendarDateDifference(values.startDate, values.endDate) * MINUTES_PER_DAY + getTimeInMinutes(values.endTime) - getTimeInMinutes(values.startTime);
  return duration > 0 ? duration : 60;
}

/**
 * Keeps a same-day end date coupled to the start date until the user chooses a
 * distinct end date. A manual end date remains intact unless it would precede
 * the new start date.
 */
export function updateLinkedStartDate(values: CalendarFormRangeValues, startDate: string, endDateLinked: boolean): CalendarFormRangeValues {
  const endDate = endDateLinked || values.endDate < startDate ? startDate : values.endDate;
  return keepTimedRangeValid({ ...values, startDate, endDate });
}

/**
 * Keeps the end time coupled to the start time until the user edits it. Linked
 * ranges preserve their wall-clock duration, including an overnight rollover.
 */
export function updateLinkedStartTime(values: CalendarFormRangeValues, startTime: string, endTimeLinked: boolean): CalendarFormRangeValues {
  if (values.allDay) return { ...values, startTime };

  if (endTimeLinked) {
    const end = addWallMinutes(values.startDate, startTime, getTimedDurationInMinutes(values));
    return { ...values, startTime, endDate: end.date, endTime: end.time };
  }

  const next = { ...values, startTime };
  if (next.endDate > next.startDate || next.endTime > next.startTime) return next;

  const end = addWallMinutes(next.startDate, startTime, 60);
  return { ...next, endDate: end.date, endTime: end.time };
}
