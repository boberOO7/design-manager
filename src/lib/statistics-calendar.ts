import type { Database } from "@/types/database.types";
import { addCalendarDays, APPLICATION_TIME_ZONE, instantToDateOnly, zonedWallTimeToIso } from "./calendar";
import { occurrenceBounds, parseRecurrenceRule, recurrenceDates } from "./calendar-recurrence";
import type { AttendanceMember } from "./statistics-attendance";
import { getCalendarEventDetailConfig } from "./calendar-event-types";
import { CALENDAR_EVENT_TYPES } from "@/types/calendar";

export type StatisticsCalendarEvent = Pick<Database["public"]["Tables"]["calendar_events"]["Row"],
  "id" | "event_type" | "starts_at" | "ends_at" | "all_day" | "project_id" | "organizer_id" | "cancelled_at" |
  "recurrence_rule" | "series_id" | "occurrence_start" | "compensates_time_off_request_id">;
export type StatisticsCalendarOccurrence = StatisticsCalendarEvent & { occurrenceId: string };
export type StatisticsCalendarRange = { from: string; through: string };

export const STATISTICS_CALENDAR_TYPES = CALENDAR_EVENT_TYPES.filter(type => type !== "work_makeup");
export type StatisticsCalendarMetrics = { count: number; timedCount: number; hours: number; averageHours: number | null; allDayCount: number; allDayDays: number; unknownDurationCount: number };

const HOUR = 3_600_000;
const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const daysBetween = (from: string, through: string) => (dateMs(through) - dateMs(from)) / 86_400_000;
const midnight = (date: string) => Date.parse(zonedWallTimeToIso(`${date}T00:00`, APPLICATION_TIME_ZONE));
const rangeBounds = (range: StatisticsCalendarRange) => ({ start: midnight(range.from), end: midnight(addCalendarDays(range.through, 1)) });
const emptyMetrics = (): StatisticsCalendarMetrics => ({ count: 0, timedCount: 0, hours: 0, averageHours: null, allDayCount: 0, allDayDays: 0, unknownDurationCount: 0 });
const occurrenceKey = (seriesId: string, start: string) => `${seriesId}:${Date.parse(start)}`;

/** Calendar visibility includes the creator on every type. Scheduled involvement
 * instead follows each type's explicit roles: e.g. a trip's participants, not
 * the administrator who entered it; an interview's assigned interviewer.
 */
export function calendarStatisticsAssignments(
  events: Array<Pick<Database["public"]["Tables"]["calendar_events"]["Row"], "id" | "event_type" | "organizer_id" | "assignee_id">>,
  invites: Array<Pick<Database["public"]["Tables"]["calendar_event_invites"]["Row"], "event_id" | "user_id" | "status">>,
  participants: Array<Pick<Database["public"]["Tables"]["calendar_event_participants"]["Row"], "event_id" | "user_id">>,
) {
  const roles = new Map(events.map(event => [event.id, getCalendarEventDetailConfig(event.event_type).sections]));
  return [
    ...events.flatMap(event => [
      ...(roles.get(event.id)?.includes("organizer") ? [event.organizer_id] : []),
      ...(roles.get(event.id)?.includes("assignee") && event.assignee_id ? [event.assignee_id] : []),
    ].map(personId => ({ eventId: event.id, personId }))),
    ...invites.flatMap(invite => invite.status !== "declined" && roles.get(invite.event_id)?.includes("invitations")
      ? [{ eventId: invite.event_id, personId: invite.user_id }] : []),
    ...participants.flatMap(participant => roles.get(participant.event_id)?.includes("participants")
      ? [{ eventId: participant.event_id, personId: participant.user_id }] : []),
  ];
}

function overlaps(event: StatisticsCalendarEvent, start: number, end: number) {
  const from = Date.parse(event.starts_at), through = Date.parse(event.ends_at);
  if (!Number.isFinite(from)) return false;
  // Invalid legacy duration has a known start, but cannot establish a span.
  return Number.isFinite(through) && through > from ? from < end && through > start : from >= start && from < end;
}

/** Input is local canonical calendar rows, without participant joins or remote copies.
 * Overrides suppress their original occurrence even when moved out of this range.
 */
export function materializeStatisticsEvents(events: StatisticsCalendarEvent[], range: StatisticsCalendarRange): StatisticsCalendarOccurrence[] {
  const { start, end } = rangeBounds(range);
  const rows = [...new Map(events.map(event => [event.id, event])).values()];
  const parents = new Map(rows.filter(event => !event.series_id).map(event => [event.id, event]));
  const overrides = new Map(rows.filter(event => event.series_id && event.occurrence_start).map(event => [occurrenceKey(event.series_id ?? "", event.occurrence_start ?? ""), event]));
  const result = new Map<string, StatisticsCalendarOccurrence>();
  const add = (event: StatisticsCalendarEvent, occurrenceId: string) => {
    if (!event.cancelled_at && overlaps(event, start, end)) result.set(occurrenceId, { ...event, occurrenceId });
  };

  for (const event of parents.values()) {
    if (event.cancelled_at || !Number.isFinite(Date.parse(event.starts_at))) continue;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (!rule) { add(event, event.id); continue; }
    const zone = event.all_day ? APPLICATION_TIME_ZONE : rule.timeZone ?? APPLICATION_TIME_ZONE;
    const firstDate = instantToDateOnly(event.starts_at, zone);
    // Expand from the template's start: long spans and recurrence count limits
    // remain correct without an arbitrary look-behind window.
    const lastDate = instantToDateOnly(new Date(end - 1).toISOString(), zone);
    for (const date of recurrenceDates(firstDate, firstDate, lastDate, rule)) {
      const endMs = Date.parse(event.ends_at);
      let bounds: { startsAt: string; endsAt: string };
      if (event.all_day && Number.isFinite(endMs) && endMs > Date.parse(event.starts_at)) {
        // Persisted all-day ends are exclusive, including across DST changes.
        const span = daysBetween(firstDate, instantToDateOnly(event.ends_at, APPLICATION_TIME_ZONE));
        bounds = { startsAt: zonedWallTimeToIso(`${date}T00:00`), endsAt: zonedWallTimeToIso(`${addCalendarDays(date, span)}T00:00`) };
      } else if (Number.isFinite(endMs) && endMs > Date.parse(event.starts_at)) {
        bounds = occurrenceBounds(event.starts_at, event.ends_at, event.all_day, date, rule.timeZone);
      } else {
        const originalEnd = occurrenceBounds(event.starts_at, event.starts_at, false, date, zone);
        bounds = { startsAt: originalEnd.startsAt, endsAt: Number.isFinite(endMs) ? originalEnd.startsAt : event.ends_at };
      }
      const key = occurrenceKey(event.id, bounds.startsAt);
      if (!overrides.has(key)) add({ ...event, starts_at: bounds.startsAt, ends_at: bounds.endsAt, series_id: event.id, occurrence_start: bounds.startsAt, recurrence_rule: null }, key);
    }
  }
  // A moved override may originate outside the selected period entirely.
  for (const override of overrides.values()) {
    if (!override.series_id || !override.occurrence_start || parents.get(override.series_id)?.cancelled_at) continue;
    if (!parents.has(override.series_id)) continue;
    add({ ...override, recurrence_rule: null }, occurrenceKey(override.series_id, override.occurrence_start));
  }
  return [...result.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.occurrenceId.localeCompare(b.occurrenceId));
}

function calendarDays(start: number, end: number) {
  if (end <= start) return 0;
  return daysBetween(instantToDateOnly(new Date(start).toISOString()), addCalendarDays(instantToDateOnly(new Date(end - 1).toISOString()), 1));
}

export function buildCalendarStatistics(events: StatisticsCalendarEvent[], projects: Array<{ id: string; name: string }>, range: StatisticsCalendarRange, now: string,
  people: { members: AttendanceMember[]; assignments: Array<{ eventId: string; personId: string }> } = { members: [], assignments: [] }) {
  const bounds = rangeBounds(range), nowMs = Date.parse(now);
  const categories = STATISTICS_CALENDAR_TYPES.map(eventType => ({ eventType, ...emptyMetrics() }));
  const byType = new Map<string, StatisticsCalendarMetrics>(categories.map(category => [category.eventType, category]));
  const projectNames = new Map(projects.map(project => [project.id, project.name]));
  const perProject = new Map<string, { id: string; name: string | null } & StatisticsCalendarMetrics>();
  const memberById = new Map(people.members.map(member => [member.id, member]));
  const peopleByEvent = new Map<string, Set<string>>();
  for (const { eventId, personId } of people.assignments) {
    const ids = peopleByEvent.get(eventId) ?? new Set<string>();
    ids.add(personId);
    peopleByEvent.set(eventId, ids);
  }
  const perPerson = new Map<string, AttendanceMember & StatisticsCalendarMetrics>();
  const totals = emptyMetrics(), projectLinked = emptyMetrics(), unlinked = emptyMetrics();
  const months: Array<{ month: string; count: number; hours: number; timedCount: number; allDayDays: number; types: Array<{ eventType: typeof STATISTICS_CALENDAR_TYPES[number]; count: number }> }> = [];
  for (let month = `${range.from.slice(0, 7)}-01`; month <= range.through;) {
    months.push({ month, count: 0, hours: 0, timedCount: 0, allDayDays: 0, types: STATISTICS_CALENDAR_TYPES.map(eventType => ({ eventType, count: 0 })) });
    const [year, number] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  }
  const monthByDate = new Map(months.map(month => [month.month.slice(0, 7), month]));
  let ongoingCount = 0, plannedCount = 0, unknownTimingCount = 0, unassignedCount = 0;
  const accumulate = (metrics: StatisticsCalendarMetrics, event: StatisticsCalendarEvent, clippedStart: number, clippedEnd: number, valid: boolean) => {
    metrics.count++;
    if (!valid) { metrics.unknownDurationCount++; return; }
    if (event.all_day) { metrics.allDayCount++; metrics.allDayDays += calendarDays(clippedStart, clippedEnd); }
    else { metrics.timedCount++; metrics.hours += (clippedEnd - clippedStart) / HOUR; metrics.averageHours = metrics.hours / metrics.timedCount; }
  };

  for (const event of materializeStatisticsEvents(events, range)) {
    const category = byType.get(event.event_type);
    if (!category) continue; // Make-up belongs to attendance accounting.
    const start = Date.parse(event.starts_at), end = Date.parse(event.ends_at);
    if (start > nowMs) { plannedCount++; continue; }
    if (!Number.isFinite(end)) { unknownTimingCount++; continue; }
    if (end > nowMs) { ongoingCount++; continue; }
    const valid = end > start;
    const clippedStart = Math.max(start, bounds.start), clippedEnd = Math.min(end, bounds.end);
    let project: ({ id: string; name: string | null } & StatisticsCalendarMetrics) | undefined;
    if (event.project_id) {
      project = perProject.get(event.project_id) ?? { id: event.project_id, name: projectNames.get(event.project_id) ?? null, ...emptyMetrics() };
      perProject.set(event.project_id, project);
    }
    for (const metrics of [totals, category, event.project_id ? projectLinked : unlinked, ...(project ? [project] : [])]) accumulate(metrics, event, clippedStart, clippedEnd, valid);
    // Generated recurrences retain their template ID; real overrides carry their
    // own ID and their own assignments, never a union with the template's people.
    const assigned = peopleByEvent.get(event.id);
    if (!assigned?.size) unassignedCount++;
    for (const id of assigned ?? []) {
      const person = perPerson.get(id) ?? { id, name: memberById.get(id)?.name ?? "", active: memberById.get(id)?.active ?? false, ...emptyMetrics() };
      accumulate(person, event, clippedStart, clippedEnd, valid);
      perPerson.set(id, person);
    }
    const countMonth = monthByDate.get(instantToDateOnly(new Date(clippedStart).toISOString()).slice(0, 7));
    if (countMonth) {
      countMonth.count++;
      const type = countMonth.types.find(type => type.eventType === event.event_type);
      if (type) type.count++;
    }
    if (!valid) continue;
    for (let index = 0; index < months.length; index++) {
      const month = months[index];
      const next = months[index + 1]?.month ?? addCalendarDays(range.through, 1);
      const from = Math.max(clippedStart, midnight(month.month)), through = Math.min(clippedEnd, midnight(next));
      if (through <= from) continue;
      if (event.all_day) month.allDayDays += calendarDays(from, through);
      else { month.hours += (through - from) / HOUR; month.timedCount++; }
    }
  }
  return { totals, categories, months, projectLinked, unlinked,
    people: [...perPerson.values()].sort((a, b) => b.hours - a.hours || b.count - a.count || a.name.localeCompare(b.name)),
    projects: [...perProject.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    projectAverages: { projectCount: perProject.size, count: perProject.size ? projectLinked.count / perProject.size : null, hours: perProject.size && projectLinked.timedCount ? projectLinked.hours / perProject.size : null },
    ongoingCount, plannedCount, unknownTimingCount, unassignedCount };
}

export type StatisticsCalendarReport = ReturnType<typeof buildCalendarStatistics>;
