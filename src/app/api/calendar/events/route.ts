import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createCalendarEventInsertPayload } from "@/lib/calendar-event-insert";
import { canCreateCalendarEventType } from "@/lib/calendar-creation";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";
import { getBusinessTripTitle } from "@/lib/calendar-event-form";
import { scheduleGoogleCalendarReconciliation } from "@/lib/google-calendar/queue";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authenticatedUser = userData.user;
  if (userError || !authenticatedUser) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });

  const activeMembership = await getActiveStudioMembership();
  if (
    !activeMembership
    || activeMembership.authenticatedUserId !== authenticatedUser.id
    || (activeMembership.system_role !== "admin" && activeMembership.system_role !== "employee")
  ) return NextResponse.json({ success: false, formError: "An active studio membership is required." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  let value = parsed.data.eventType === "site_visit"
    ? { ...parsed.data, assigneeId: activeMembership.system_role === "admin" ? parsed.data.assigneeId : activeMembership.authenticatedUserId }
    : parsed.data.eventType === "interview"
      ? { ...parsed.data, projectId: null, allDay: false, attendeeIds: [], participantIds: [], location: null, recurrenceRule: null, compensatesTimeOffRequestId: null, meetingMode: null }
    : parsed.data.eventType === "business_trip"
      ? { ...parsed.data, attendeeIds: [], assigneeId: null, meetingUrl: null, location: null, recurrenceRule: null, participantIds: activeMembership.system_role === "admin" ? parsed.data.participantIds : [activeMembership.authenticatedUserId] }
    : parsed.data.eventType === "meeting" || parsed.data.eventType === "presentation"
      ? { ...parsed.data, allDay: false, assigneeId: null, recurrenceRule: null, location: parsed.data.meetingMode === "offline" ? parsed.data.location : null, meetingUrl: parsed.data.meetingMode === "online" ? parsed.data.meetingUrl : null }
      : { ...parsed.data, assigneeId: null };
  if (!canCreateCalendarEventType(activeMembership.system_role, value.eventType)) {
    return NextResponse.json({ success: false, fieldErrors: { eventType: "This event type is not available for your role." } }, { status: 403 });
  }
  if (value.eventType === "business_trip") {
    if (value.participantIds.length === 0) return NextResponse.json({ success: false, fieldErrors: { participantIds: "Choose at least one business trip participant." } }, { status: 400 });
    const { data: project } = await supabase.from("projects").select("name").eq("id", value.projectId ?? "").eq("studio_id", activeMembership.studio_id).maybeSingle();
    if (!project) return NextResponse.json({ success: false, fieldErrors: { projectId: "Choose an accessible project." } }, { status: 400 });
    value = { ...value, title: getBusinessTripTitle(project.name, request.headers.get("accept-language")?.toLowerCase().startsWith("uk") ? "uk" : "en") };
  }
  const payload = createCalendarEventInsertPayload(value, authenticatedUser.id, {
    userId: activeMembership.authenticatedUserId,
    studioId: activeMembership.studio_id,
    systemRole: activeMembership.system_role,
    isActive: true,
  });

  const { data: eventId, error } = await supabase.rpc("create_calendar_event_with_invites", {
    p_studio_id: payload.studio_id,
    p_project_id: payload.project_id,
    p_title: payload.title,
    p_description: payload.description,
    p_event_type: payload.event_type,
    p_starts_at: payload.starts_at,
    p_ends_at: payload.ends_at,
    p_all_day: payload.all_day,
    p_location: payload.location,
    p_meeting_url: payload.meeting_url,
    p_meeting_mode: payload.meeting_mode,
    p_attendee_ids: value.attendeeIds,
    p_recurrence_rule: payload.recurrence_rule,
    p_compensates_time_off_request_id: payload.compensates_time_off_request_id,
    p_assignee_id: payload.assignee_id,
    p_participant_ids: value.participantIds,
  });
  if (error || !eventId) {
    console.error("calendar event and invitation creation error", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });
  }

  scheduleGoogleCalendarReconciliation();
  const item = await getNormalizedCalendarEvent(eventId);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The event was created but could not be reloaded." }, { status: 500 });
}
