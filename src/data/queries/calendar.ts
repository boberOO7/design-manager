import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getInclusiveAllDayEndDate } from "@/lib/calendar-event-form";
import { addCalendarDays, deduplicateCalendarItems, instantToDateOnly, zonedWallTimeToIso } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import type { CalendarItem, CalendarPageData, CalendarPerson, CalendarProject, TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

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
    .select("id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, created_by, project:projects!calendar_events_project_id_fkey(id, name), attendees:calendar_event_attendees(user_id, profile:profiles!calendar_event_attendees_user_id_fkey(id, full_name, job_title))")
    .eq("studio_id", membership.studio_id)
    .is("cancelled_at", null)
    .lt("starts_at", rangeEndExclusive)
    .gt("ends_at", rangeStartInstant)
    .order("starts_at");

  const timeOffPromise = supabase
    .from("time_off_requests")
    .select("id, user_id, request_type, start_date, end_date, start_time, end_time, all_day, private_note, status, reviewed_by, reviewed_at, review_note")
    .eq("studio_id", membership.studio_id)
    .lte("start_date", end)
    .gte("end_date", start)
    .order("start_date");

  const peoplePromise = supabase
    .from("studio_members")
    .select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, assignments:project_members(project_id, is_active))")
    .eq("studio_id", membership.studio_id)
    .eq("is_active", true);

  const coworkerPromise = isAdmin
    ? Promise.resolve({ data: [], error: null })
    : supabase.rpc("get_calendar_coworker_availability", {
      target_studio_id: membership.studio_id,
      range_start: start,
      range_end: end,
    });

  const [projectsResult, projectDeadlinesResult, taskDeadlinesResult, eventsResult, timeOffResult, peopleResult, coworkerResult] = await Promise.all([
    projectsPromise,
    projectDeadlinesPromise,
    taskDeadlinesPromise,
    eventsPromise,
    timeOffPromise,
    peoplePromise,
    coworkerPromise,
  ]);

  const errors = [projectsResult.error, projectDeadlinesResult.error, taskDeadlinesResult.error, eventsResult.error, timeOffResult.error, peopleResult.error, coworkerResult.error].filter(Boolean);
  if (errors.length > 0) {
    console.error("Unable to load Calendar data", errors);
    throw new Error("Unable to load Calendar data.");
  }

  const projects: CalendarProject[] = projectsResult.data ?? [];
  const people: CalendarPerson[] = (peopleResult.data ?? []).map((membershipRow) => ({
    id: membershipRow.profile.id,
    full_name: membershipRow.profile.full_name,
    job_title: membershipRow.profile.job_title,
    projectIds: membershipRow.profile.assignments.filter((assignment) => assignment.is_active).map((assignment) => assignment.project_id),
  })).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const items: CalendarItem[] = [];

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
    if (!task.due_date) continue;
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

  for (const event of eventsResult.data ?? []) {
    const attendees: CalendarPerson[] = event.attendees.map((attendee) => ({ ...attendee.profile, projectIds: [] }));
    const personIds = [...attendees.map((attendee) => attendee.id), event.created_by];
    if (event.project_id === null) personIds.push(membership.authenticatedUserId);
    items.push({
      source: "calendar_event", key: `calendar_event:${event.id}`, id: event.id,
      title: event.title, startDate: instantToDateOnly(event.starts_at), endDate: event.all_day ? getInclusiveAllDayEndDate(event.ends_at) : instantToDateOnly(event.ends_at),
      allDay: event.all_day, projectId: event.project_id, personIds: [...new Set(personIds)],
      eventType: event.event_type, startsAt: event.starts_at, endsAt: event.ends_at,
      description: event.description, location: event.location, meetingUrl: event.meeting_url,
      project: event.project, attendees,
    });
  }

  for (const request of timeOffResult.data ?? []) {
    const person = peopleById.get(request.user_id);
    if (!person || request.status === "cancelled") continue;
    items.push({
      source: "time_off_request_admin", key: `time_off_request_admin:${request.id}`, id: request.id,
      title: request.status === "pending" ? "Pending request" : request.status === "rejected" ? "Rejected request" : "Out of office",
      startDate: request.start_date, endDate: request.end_date, allDay: request.all_day, projectId: null,
      personIds: [request.user_id], userId: request.user_id, employeeName: person.full_name,
      requestType: request.request_type as TimeOffRequestType, status: request.status as TimeOffStatus,
      startTime: request.start_time, endTime: request.end_time, privateNote: request.private_note,
      reviewNote: request.review_note, reviewedBy: request.reviewed_by, reviewedAt: request.reviewed_at,
      isOwn: request.user_id === membership.authenticatedUserId,
    });
  }

  for (const availability of coworkerResult.data ?? []) {
    items.push({
      source: "time_off", key: `time_off:${availability.id}`, id: availability.id,
      title: "Out of office", startDate: availability.start_date, endDate: availability.end_date,
      allDay: availability.all_day, projectId: null, personIds: [availability.user_id],
      userId: availability.user_id, employeeName: availability.employee_name,
      startTime: availability.start_time, endTime: availability.end_time,
    });
  }

  return {
    items: deduplicateCalendarItems(items), projects, people,
    currentUserId: membership.authenticatedUserId, isAdmin,
    pendingCount: isAdmin ? items.filter((item) => item.source === "time_off_request_admin" && item.status === "pending").length : 0,
    rangeStart: start, rangeEnd: end,
    today: instantToDateOnly(new Date().toISOString()),
  };
}
