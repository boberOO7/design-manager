import "server-only";

import { getInclusiveAllDayEndDate } from "@/lib/calendar-event-form";
import { instantToDateOnly, normalizePrivateTimeOff } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import type { CalendarItem, TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

export async function getNormalizedCalendarEvent(eventId: string, currentUserId: string): Promise<Extract<CalendarItem, { source: "calendar_event" }> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, organizer_id, recurrence_rule, series_id, occurrence_start, compensates_time_off_request_id, project:projects!calendar_events_project_id_fkey(id, name), organizer:profiles!calendar_events_organizer_id_fkey(id, full_name, job_title, avatar_url), invitees:calendar_event_invites(id, user_id, status, profile:profiles!calendar_event_invites_user_id_fkey(id, full_name, job_title, avatar_url))")
    .eq("id", eventId)
    .is("cancelled_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const { data: compensationDayOff } = data.compensates_time_off_request_id
    ? await supabase.from("time_off_requests").select("id, start_date, end_date, start_time, end_time, all_day").eq("id", data.compensates_time_off_request_id).eq("request_type", "day_off").eq("status", "approved").maybeSingle()
    : { data: null };
  const invitees = data.invitees.map((invite) => ({ ...invite.profile, projectIds: [], inviteId: invite.id, status: invite.status }));
  return {
    source: "calendar_event", key: `calendar_event:${data.id}`, id: data.id, title: data.title,
    startDate: instantToDateOnly(data.starts_at), endDate: data.all_day ? getInclusiveAllDayEndDate(data.ends_at) : instantToDateOnly(data.ends_at), allDay: data.all_day,
    projectId: data.project_id, personIds: [...new Set([...invitees.map((person) => person.id), data.organizer_id, ...(data.project_id === null ? [currentUserId] : [])])],
    eventType: data.event_type, startsAt: data.starts_at, endsAt: data.ends_at, compensatesTimeOffRequestId: data.compensates_time_off_request_id, compensationDayOff: compensationDayOff ? { id: compensationDayOff.id, startDate: compensationDayOff.start_date, endDate: compensationDayOff.end_date, startTime: compensationDayOff.start_time, endTime: compensationDayOff.end_time, allDay: compensationDayOff.all_day, remainingMinutes: 0 } : null, description: data.description,
    location: data.location, meetingUrl: data.meeting_url, recurrenceRule: null, seriesId: data.series_id, occurrenceStart: data.occurrence_start, project: data.project, organizer: { ...data.organizer, projectIds: [] }, invitees,
  };
}

export async function getNormalizedTimeOffRequest(requestId: string, currentUserId: string): Promise<Extract<CalendarItem, { source: "time_off_request_admin" }> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_off_requests")
    .select("id, user_id, request_type, start_date, end_date, start_time, end_time, all_day, private_note, status, reviewed_by, reviewed_at, review_note, profile:profiles!time_off_requests_user_id_fkey!inner(full_name)")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data || data.status === "cancelled") return null;
  return normalizePrivateTimeOff({
    id: data.id, userId: data.user_id, employeeName: data.profile.full_name,
    requestType: data.request_type as TimeOffRequestType, status: data.status as TimeOffStatus,
    startDate: data.start_date, endDate: data.end_date, startTime: data.start_time,
    endTime: data.end_time, allDay: data.all_day, privateNote: data.private_note,
    reviewNote: data.review_note, reviewedBy: data.reviewed_by, reviewedAt: data.reviewed_at,
    currentUserId,
  });
}
