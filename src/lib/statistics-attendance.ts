import type { Database } from "@/types/database.types";
import { addCalendarDays, instantToDateOnly, instantToWallInput, zonedWallTimeToIso } from "./calendar";
import { getWorkMakeupMinutes } from "./time-off-compensation";
import { parseRecurrenceRule, recurrenceDates } from "./calendar-recurrence";
import { materializeStatisticsEvents, type StatisticsCalendarEvent } from "./statistics-calendar";

type Tables = Database["public"]["Tables"];
export type AttendanceRequest = Pick<Tables["time_off_requests"]["Row"],
  "id" | "user_id" | "request_type" | "start_date" | "end_date" | "start_time" | "end_time" | "all_day" | "status">;
export type AttendanceMakeupEvent = StatisticsCalendarEvent;
export type AttendanceMember = { id: string; name: string; active: boolean };
export const attendanceCategories = ["vacation", "day_off", "medical_appointment", "sick_leave", "other"] as const;
export type AttendanceCategory = Database["public"]["Enums"]["time_off_request_type"];
export type AttendanceLeave = Record<AttendanceCategory, { days: number; hours: number }>;
export type AttendanceCounts = {
  elapsedLeave: AttendanceLeave;
  futureLeave: AttendanceLeave;
  elapsedMakeupHours: number;
  plannedMakeupHours: number | null;
  boundaryMakeupCount: number;
};
export type AttendanceEmployee = AttendanceMember & AttendanceCounts;
export type AttendanceStatistics = { employees: AttendanceEmployee[]; totals: AttendanceCounts };

type Interval = [number, number];
type LeaveIntervals = Record<AttendanceCategory, { days: Interval[]; minutes: Interval[] }>;
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const timeMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const emptyLeave = (): AttendanceLeave => ({
  vacation: { days: 0, hours: 0 }, day_off: { days: 0, hours: 0 },
  medical_appointment: { days: 0, hours: 0 }, sick_leave: { days: 0, hours: 0 }, other: { days: 0, hours: 0 },
});
const emptyIntervals = (): LeaveIntervals => ({
  vacation: { days: [], minutes: [] }, day_off: { days: [], minutes: [] },
  medical_appointment: { days: [], minutes: [] }, sick_leave: { days: [], minutes: [] }, other: { days: [], minutes: [] },
});
const emptyCounts = (): AttendanceCounts => ({
  elapsedLeave: emptyLeave(), futureLeave: emptyLeave(), elapsedMakeupHours: 0, plannedMakeupHours: 0, boundaryMakeupCount: 0,
});

function union(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const [start, end] of intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function leaveCounts(intervals: LeaveIntervals): AttendanceLeave {
  const counts = emptyLeave();
  for (const category of attendanceCategories) {
    const days = union(intervals[category].days);
    const minutes = union(intervals[category].minutes);
    // A partial absence already covered by a full calendar day is not counted twice.
    const coveredMinutes = minutes.reduce((total, [start, end]) => total + days.reduce((overlap, [from, through]) =>
      overlap + Math.max(0, Math.min(end, through * 1440) - Math.max(start, from * 1440)), 0), 0);
    counts[category] = {
      days: days.reduce((total, [start, end]) => total + end - start, 0),
      hours: (minutes.reduce((total, [start, end]) => total + end - start, 0) - coveredMinutes) / 60,
    };
  }
  return counts;
}

/** Approved calendar days and partial wall-clock hours are separate units. Historical
 * usage is clipped to the selected period and now; future full-day commitments start
 * tomorrow, while partial commitments include today's remaining scheduled hours.
 * Commitments span all dates. Scheduled makeup hours are not verified hours worked. */
export function buildAttendanceStatistics(
  requests: readonly AttendanceRequest[],
  events: readonly AttendanceMakeupEvent[],
  members: readonly AttendanceMember[],
  range: { from: string; through: string },
  now: string,
): AttendanceStatistics {
  const today = instantToDateOnly(now);
  const tomorrow = addCalendarDays(today, 1);
  const elapsedThrough = range.through < today ? range.through : today;
  const nowWall = instantToWallInput(now);
  const nowMinute = dayIndex(today) * 1440 + timeMinutes(nowWall.split("T")[1]);
  const memberById = new Map(members.map(member => [member.id, member]));
  const employees = new Map<string, AttendanceEmployee>();
  const intervals = new Map<string, { elapsed: LeaveIntervals; future: LeaveIntervals }>();
  const employeeFor = (id: string) => {
    let employee = employees.get(id);
    if (!employee) {
      const member = memberById.get(id);
      employee = { id, name: member?.name ?? id, active: member?.active ?? false, ...emptyCounts() };
      employees.set(id, employee);
    }
    return employee;
  };
  for (const member of members) if (member.active) employeeFor(member.id);

  for (const request of requests) {
    if (request.status !== "approved") continue;
    const elapsedStart = Math.max(dayIndex(request.start_date), dayIndex(range.from));
    const elapsedEnd = Math.min(dayIndex(request.end_date) + 1, dayIndex(elapsedThrough) + 1);
    const futureStart = Math.max(dayIndex(request.start_date), dayIndex(request.all_day ? tomorrow : today));
    const futureEnd = dayIndex(request.end_date) + 1;
    const selectedElapsed = elapsedEnd > elapsedStart;
    const selectedFuture = futureEnd > futureStart;
    if (!selectedElapsed && !selectedFuture) continue;
    employeeFor(request.user_id);
    let employeeIntervals = intervals.get(request.user_id);
    if (!employeeIntervals) {
      employeeIntervals = { elapsed: emptyIntervals(), future: emptyIntervals() };
      intervals.set(request.user_id, employeeIntervals);
    }
    if (request.all_day) {
      if (selectedElapsed) employeeIntervals.elapsed[request.request_type].days.push([elapsedStart, elapsedEnd]);
      if (selectedFuture) employeeIntervals.future[request.request_type].days.push([futureStart, futureEnd]);
    } else if (request.start_time && request.end_time) {
      const start = dayIndex(request.start_date) * 1440 + timeMinutes(request.start_time);
      const end = dayIndex(request.start_date) * 1440 + timeMinutes(request.end_time);
      if (selectedElapsed) employeeIntervals.elapsed[request.request_type].minutes.push([
        Math.max(start, elapsedStart * 1440), Math.min(end, elapsedEnd * 1440, nowMinute),
      ]);
      if (selectedFuture) employeeIntervals.future[request.request_type].minutes.push([Math.max(start, nowMinute), end]);
    }
  }
  for (const [id, employeeIntervals] of intervals) {
    const employee = employeeFor(id);
    employee.elapsedLeave = leaveCounts(employeeIntervals.elapsed);
    employee.futureLeave = leaveCounts(employeeIntervals.future);
  }

  const periodStart = Date.parse(zonedWallTimeToIso(`${range.from}T00:00`));
  const periodEnd = Date.parse(zonedWallTimeToIso(`${addCalendarDays(range.through, 1)}T00:00`));
  const nowInstant = Date.parse(now);
  const calendarRows = [...new Map(events.map(event => [event.id, event])).values()];
  const elapsedOccurrences = range.from <= elapsedThrough
    ? materializeStatisticsEvents(calendarRows, { from: range.from, through: elapsedThrough }) : [];
  for (const event of elapsedOccurrences) {
    if (event.event_type !== "work_makeup") continue;
    const start = Date.parse(event.starts_at);
    const end = Date.parse(event.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const elapsedStart = Math.max(start, periodStart);
    const elapsedEnd = Math.min(end, periodEnd, nowInstant);
    const crossesBoundary = event.all_day && end <= nowInstant && (start < periodStart || end > periodEnd);
    const elapsedMinutes = event.all_day
      ? (end <= nowInstant && !crossesBoundary ? getWorkMakeupMinutes({ startsAt: event.starts_at, endsAt: event.ends_at, allDay: true }) : 0)
      : (elapsedEnd > elapsedStart ? getWorkMakeupMinutes({ startsAt: new Date(elapsedStart).toISOString(), endsAt: new Date(elapsedEnd).toISOString(), allDay: false }) : 0);
    if (!elapsedMinutes && !crossesBoundary) continue;
    const employee = employeeFor(event.organizer_id);
    employee.elapsedMakeupHours += elapsedMinutes / 60;
    if (crossesBoundary) employee.boundaryMakeupCount++;
  }

  const addPlanned = (event: AttendanceMakeupEvent) => {
    if (event.event_type !== "work_makeup" || event.cancelled_at) return;
    const start = Date.parse(event.starts_at), end = Date.parse(event.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= Math.max(start, nowInstant)) return;
    const employee = employeeFor(event.organizer_id);
    if (employee.plannedMakeupHours === null) return;
    employee.plannedMakeupHours += getWorkMakeupMinutes({
      startsAt: new Date(Math.max(start, nowInstant)).toISOString(), endsAt: event.ends_at, allDay: event.all_day,
    }) / 60;
  };
  for (const event of calendarRows) {
    if (event.series_id || event.cancelled_at || !Number.isFinite(Date.parse(event.starts_at))) continue;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (!rule) { addPlanned(event); continue; }
    const overrides = calendarRows.filter(row => row.series_id === event.id && row.occurrence_start);
    // A different event category can have a concrete override changed to makeup.
    if (event.event_type !== "work_makeup") {
      for (const override of overrides) addPlanned(override);
      continue;
    }
    const zone = event.all_day ? undefined : rule.timeZone;
    const firstDate = instantToDateOnly(event.starts_at, zone);
    const recurrenceToday = instantToDateOnly(now, zone);
    const elapsedDates = recurrenceDates(firstDate, firstDate, recurrenceToday, rule);
    const exhaustedCount = rule.occurrenceCount !== null && elapsedDates.length >= rule.occurrenceCount;
    // Do not expand live schedules into an arbitrarily distant future merely
    // to total plans. Even an explicit end date can be centuries ahead. Once
    // recurrence has ended, only today's remainder / concrete overrides remain.
    const endedRecurrence = exhaustedCount || (rule.endsOn !== null && rule.endsOn <= recurrenceToday);
    if (!endedRecurrence) {
      employeeFor(event.organizer_id).plannedMakeupHours = null;
      for (const override of overrides) addPlanned(override);
      continue;
    }
    const futureThrough = [today,
      ...overrides.filter(row => !row.cancelled_at && Number.isFinite(Date.parse(row.starts_at))).map(row => instantToDateOnly(row.starts_at)),
    ].sort().at(-1) ?? today;
    for (const occurrence of materializeStatisticsEvents([event, ...overrides], { from: today, through: futureThrough })) addPlanned(occurrence);
  }

  const totals = emptyCounts();
  for (const employee of employees.values()) {
    for (const category of attendanceCategories) {
      for (const field of ["elapsedLeave", "futureLeave"] as const) {
        totals[field][category].days += employee[field][category].days;
        totals[field][category].hours += employee[field][category].hours;
      }
    }
    totals.elapsedMakeupHours += employee.elapsedMakeupHours;
    totals.plannedMakeupHours = totals.plannedMakeupHours === null || employee.plannedMakeupHours === null
      ? null : totals.plannedMakeupHours + employee.plannedMakeupHours;
    totals.boundaryMakeupCount += employee.boundaryMakeupCount;
  }
  return { employees: [...employees.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), totals };
}
