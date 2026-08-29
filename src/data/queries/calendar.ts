import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getInclusiveAllDayEndDate } from "@/lib/calendar-event-form";
import { addCalendarDays, deduplicateCalendarItems, instantToDateOnly, normalizeCoworkerTimeOff, normalizePrivateTimeOff, zonedWallTimeToIso } from "@/lib/calendar";
import { buildCalendarSystemEvents } from "@/lib/calendar-system-events";
import { occurrenceBounds, parseRecurrenceRule, recurrenceDates } from "@/lib/calendar-recurrence";
import { createClient } from "@/lib/supabase/server";
import { getDayOffCompensation } from "@/lib/time-off-compensation";
import type { CalendarCompensableDayOff, CalendarItem, CalendarPageData, CalendarPerson, CalendarProject, TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

type CalendarQueryInput = { start: string; end: string };

export async function getCalendarData({ start, end }: CalendarQueryInput): Promise<CalendarPageData | null> {
  const membership = await getActiveStudioMembership();
  if (!membership) return null;

  const supabase = await createClient();
  const isAdmin = membership.system_role === "admin";
  const rangeStartInstant = zonedWallTimeToIso(`${start}T00:00`);
  const rangeEndExclusive = zonedWallTimeToIso(`${addCalendarDays(end, 1)}T00:00`);

  const projectsPromise = supabase
    .from("projects")
    .select("id, name, project_code, client_name, status")
    .eq("studio_id", membership.studio_id)
    .neq("status", "archived")
    .is("archived_at", null)
    .order("name");

  const projectDeadlinesPromise = supabase
    .from("projects")
    .select("id, name, client_name, status, due_date, members:project_members(user_id, is_active)")
    .eq("studio_id", membership.studio_id)
    .not("due_date", "is", null)
    .gte("due_date", start)
    .lte("due_date", end)
    .neq("status", "archived")
    .order("due_date");

  const taskDeadlinesPromise = supabase
    .from("tasks")
    .select("id, project_id, title, description, status, priority, assignee_id, due_date, project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status), assignee:profiles!tasks_assignee_id_fkey!inner(id, full_name)")
    .eq("project.studio_id", membership.studio_id)
    .not("due_date", "is", null)
    .gte("due_date", start)
    .lte("due_date", end)
    .neq("status", "cancelled")
    .order("due_date");

  const eventsPromise = supabase
    .from("calendar_events")
    .select("id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, organizer_id, recurrence_rule, series_id, occurrence_start, cancelled_at, compensates_time_off_request_id, project:projects!calendar_events_project_id_fkey(id, name), organizer:profiles!calendar_events_organizer_id_fkey(id, full_name, job_title, avatar_url), invitees:calendar_event_invites(id, user_id, status, profile:profiles!calendar_event_invites_user_id_fkey(id, full_name, job_title, avatar_url))")
    .eq("studio_id", membership.studio_id)
    .or(`and(series_id.is.null,cancelled_at.is.null,recurrence_rule.not.is.null),and(series_id.is.null,cancelled_at.is.null,recurrence_rule.is.null,starts_at.lt.${rangeEndExclusive},ends_at.gt.${rangeStartInstant}),and(series_id.not.is.null,occurrence_start.gte.${rangeStartInstant},occurrence_start.lt.${rangeEndExclusive})`)
    .order("starts_at");

  const timeOffPromise = supabase
    .from("time_off_requests")
    .select("id, user_id, request_type, start_date, end_date, start_time, end_time, all_day, private_note, status, reviewed_by, reviewed_at, review_note, subject:profiles!time_off_requests_user_id_fkey!inner(full_name)")
    .eq("studio_id", membership.studio_id)
    .lte("start_date", end)
    .gte("end_date", start)
    .order("start_date");

  const peoplePromise = supabase
    .from("studio_members")
    .select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, assignments:project_members(project_id, is_active))")
    .eq("studio_id", membership.studio_id)
    .eq("is_active", true);

  const systemMembersPromise = supabase
    .from("studio_members")
    .select("id, user_id, joined_at, profile:profiles!studio_members_user_id_fkey!inner(id, full_name, avatar_url, birth_date, is_active)")
    .eq("studio_id", membership.studio_id)
    .eq("is_active", true)
    .eq("profile.is_active", true);

  const coworkerPromise = isAdmin
    ? Promise.resolve({ data: [], error: null })
    : supabase.rpc("get_calendar_coworker_availability", {
      target_studio_id: membership.studio_id,
      range_start: start,
      range_end: end,
    });
  const ownApprovedDayOffsPromise = supabase.from("time_off_requests").select("id, start_date, end_date, start_time, end_time, all_day").eq("studio_id", membership.studio_id).eq("user_id", membership.authenticatedUserId).eq("request_type", "day_off").eq("status", "approved");

  const [projectsResult, projectDeadlinesResult, taskDeadlinesResult, eventsResult, timeOffResult, peopleResult, systemMembersResult, coworkerResult, ownApprovedDayOffsResult] = await Promise.all([
    projectsPromise,
    projectDeadlinesPromise,
    taskDeadlinesPromise,
    eventsPromise,
    timeOffPromise,
    peoplePromise,
    systemMembersPromise,
    coworkerPromise,
    ownApprovedDayOffsPromise,
  ]);

  const errors = [projectsResult.error, projectDeadlinesResult.error, taskDeadlinesResult.error, eventsResult.error, timeOffResult.error, peopleResult.error, systemMembersResult.error, coworkerResult.error, ownApprovedDayOffsResult.error].filter(Boolean);
  if (errors.length > 0) {
    console.error("Unable to load Calendar data", errors);
    throw new Error("Unable to load Calendar data.");
  }

  const projects: CalendarProject[] = projectsResult.data ?? [];
  const detailDayOffs = (timeOffResult.data ?? []).filter((request) => request.request_type === "day_off" && request.status === "approved");
  const linkedRequestIds = (eventsResult.data ?? []).map((event) => event.compensates_time_off_request_id).filter((id): id is string => id !== null);
  const linkedDayOffsResult = linkedRequestIds.length ? await supabase.from("time_off_requests").select("id, start_date, end_date, start_time, end_time, all_day").in("id", linkedRequestIds).eq("request_type", "day_off").eq("status", "approved") : { data: [], error: null };
  if (linkedDayOffsResult.error) throw new Error("Unable to load linked day-off details.");
  const compensationRequestIds = [...new Set([...detailDayOffs, ...(ownApprovedDayOffsResult.data ?? []), ...(linkedDayOffsResult.data ?? [])].map((request) => request.id))];
  const compensationEventsResult = compensationRequestIds.length ? await supabase.from("calendar_events").select("id, starts_at, ends_at, all_day, cancelled_at, compensates_time_off_request_id").eq("studio_id", membership.studio_id).eq("event_type", "work_makeup").in("compensates_time_off_request_id", compensationRequestIds) : { data: [], error: null };
  if (compensationEventsResult.error) throw new Error("Unable to load day-off compensation.");
  const compensationFor = (request: { id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null; all_day: boolean }) => getDayOffCompensation({ id: request.id, startDate: request.start_date, endDate: request.end_date, startTime: request.start_time, endTime: request.end_time, allDay: request.all_day }, (compensationEventsResult.data ?? []).filter((event) => event.compensates_time_off_request_id === request.id).map((event) => ({ id: event.id, startsAt: event.starts_at, endsAt: event.ends_at, allDay: event.all_day, cancelledAt: event.cancelled_at, compensatesTimeOffRequestId: event.compensates_time_off_request_id })));
  const compensableDayOffs: CalendarCompensableDayOff[] = (ownApprovedDayOffsResult.data ?? []).map((request) => ({ id: request.id, startDate: request.start_date, endDate: request.end_date, startTime: request.start_time, endTime: request.end_time, allDay: request.all_day, remainingMinutes: compensationFor(request).remainingMinutes })).filter((request) => request.remainingMinutes > 0);
  const linkedDayOffById = new Map((linkedDayOffsResult.data ?? []).map((request) => [request.id, { id: request.id, startDate: request.start_date, endDate: request.end_date, startTime: request.start_time, endTime: request.end_time, allDay: request.all_day, remainingMinutes: compensationFor(request).remainingMinutes }]));
  const people: CalendarPerson[] = (peopleResult.data ?? []).map((membershipRow) => ({
    id: membershipRow.profile.id,
    full_name: membershipRow.profile.full_name,
    job_title: membershipRow.profile.job_title,
    avatar_url: membershipRow.profile.avatar_url,
    projectIds: membershipRow.profile.assignments.filter((assignment) => assignment.is_active).map((assignment) => assignment.project_id),
  })).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const items: CalendarItem[] = [];

  items.push(...buildCalendarSystemEvents((systemMembersResult.data ?? []).map((member) => ({
    membershipId: member.id, userId: member.user_id, fullName: member.profile.full_name,
    avatarUrl: member.profile.avatar_url, birthDate: member.profile.birth_date, joinedAt: member.joined_at,
  })), start, end, { excludeSalaryPaymentsForUserId: membership.authenticatedUserId, includeSalaryPayments: isAdmin }));

  for (const project of projectDeadlinesResult.data ?? []) {
    if (!project.due_date) continue;
    items.push({
      source: "project_deadline", key: `project_deadline:${project.id}`, id: project.id,
      title: project.name, startDate: project.due_date, endDate: project.due_date, allDay: true,
      projectId: project.id, personIds: project.members.filter((member) => member.is_active).map((member) => member.user_id),
      project: { id: project.id, name: project.name, clientName: project.client_name, status: project.status },
    });
  }

  for (const task of taskDeadlinesResult.data ?? []) {
    if (!task.due_date || !task.assignee_id) continue;
    items.push({
      source: "task_deadline", key: `task_deadline:${task.id}`, id: task.id,
      title: task.title, startDate: task.due_date, endDate: task.due_date, allDay: true,
      projectId: task.project_id, personIds: [task.assignee_id],
      task: {
        id: task.id, projectId: task.project_id, projectName: task.project.name,
        description: task.description, status: task.status, priority: task.priority,
        assigneeId: task.assignee_id, assigneeName: task.assignee.full_name,
      },
    });
  }

  const events = eventsResult.data ?? [];
  const overrides = new Map(events.filter((event) => event.series_id && event.occurrence_start).map((event) => [`${event.series_id}:${event.occurrence_start}`, event]));
  for (const event of events) {
    if (event.series_id) continue;
    const invitees = event.invitees.map((invite) => ({ ...invite.profile, projectIds: [], inviteId: invite.id, status: invite.status }));
    const personIds = [...invitees.map((invitee) => invitee.id), event.organizer_id];
    if (event.project_id === null) personIds.push(membership.authenticatedUserId);
    const baseItem: Extract<CalendarItem, { source: "calendar_event" }> = {
      source: "calendar_event", key: `calendar_event:${event.id}`, id: event.id,
      title: event.title, startDate: instantToDateOnly(event.starts_at), endDate: event.all_day ? getInclusiveAllDayEndDate(event.ends_at) : instantToDateOnly(event.ends_at),
      allDay: event.all_day, projectId: event.project_id, personIds: [...new Set(personIds)],
      eventType: event.event_type, startsAt: event.starts_at, endsAt: event.ends_at,
      description: event.description, location: event.location, meetingUrl: event.meeting_url,
      recurrenceRule: parseRecurrenceRule(event.recurrence_rule), seriesId: null, occurrenceStart: null,
      compensatesTimeOffRequestId: event.compensates_time_off_request_id, compensationDayOff: event.compensates_time_off_request_id ? linkedDayOffById.get(event.compensates_time_off_request_id) ?? null : null,
      project: event.project, organizer: { ...event.organizer, projectIds: [] }, invitees,
    };
    const rule = baseItem.recurrenceRule;
    if (!rule) { items.push(baseItem); continue; }
    for (const occurrenceDate of recurrenceDates(baseItem.startDate, start, end, rule)) {
      const bounds = occurrenceBounds(event.starts_at, event.ends_at, event.all_day, occurrenceDate);
      const originalStart = bounds.startsAt; const override = overrides.get(`${event.id}:${originalStart}`);
      if (override?.cancelled_at) continue;
      if (override) {
        const overrideInvitees = override.invitees.map((invite) => ({ ...invite.profile, projectIds: [], inviteId: invite.id, status: invite.status }));
        items.push({ ...baseItem, key: `calendar_event:${override.id}`, id: override.id, title: override.title, startsAt: override.starts_at, endsAt: override.ends_at, startDate: instantToDateOnly(override.starts_at), endDate: override.all_day ? getInclusiveAllDayEndDate(override.ends_at) : instantToDateOnly(override.ends_at), allDay: override.all_day, description: override.description, location: override.location, meetingUrl: override.meeting_url, recurrenceRule: null, seriesId: event.id, occurrenceStart: originalStart, compensatesTimeOffRequestId: override.compensates_time_off_request_id, compensationDayOff: override.compensates_time_off_request_id ? linkedDayOffById.get(override.compensates_time_off_request_id) ?? null : null, invitees: overrideInvitees });
      } else items.push({ ...baseItem, key: `calendar_event:${event.id}:${originalStart}`, id: event.id, startsAt: bounds.startsAt, endsAt: bounds.endsAt, startDate: instantToDateOnly(bounds.startsAt), endDate: event.all_day ? getInclusiveAllDayEndDate(bounds.endsAt) : instantToDateOnly(bounds.endsAt), seriesId: event.id, occurrenceStart: originalStart });
    }
  }

  for (const request of timeOffResult.data ?? []) {
    const item = normalizePrivateTimeOff({
      id: request.id, userId: request.user_id, employeeName: request.subject.full_name,
      requestType: request.request_type as TimeOffRequestType, status: request.status as TimeOffStatus,
      startDate: request.start_date, endDate: request.end_date, startTime: request.start_time,
      endTime: request.end_time, allDay: request.all_day, privateNote: request.private_note,
      reviewNote: request.review_note, reviewedBy: request.reviewed_by, reviewedAt: request.reviewed_at,
      currentUserId: membership.authenticatedUserId,
    });
    if (item) items.push({ ...item, compensation: request.request_type === "day_off" && request.status === "approved" ? compensationFor(request) : null });
  }

  for (const availability of coworkerResult.data ?? []) {
    const item = normalizeCoworkerTimeOff({
      id: availability.id, userId: availability.user_id, employeeName: availability.employee_name,
      startDate: availability.start_date, endDate: availability.end_date, startTime: availability.start_time,
      endTime: availability.end_time, allDay: availability.all_day, status: "approved",
    });
    if (item) items.push(item);
  }

  return {
    items: deduplicateCalendarItems(items), projects, people,
    currentUserId: membership.authenticatedUserId, isAdmin,
    pendingCount: isAdmin ? items.filter((item) => item.source === "time_off_request_admin" && item.status === "pending").length : 0,
    rangeStart: start, rangeEnd: end,
    today: instantToDateOnly(new Date().toISOString()),
    compensableDayOffs,
  };
}
