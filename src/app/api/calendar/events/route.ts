import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createCalendarEventInsertPayload } from "@/lib/calendar-event-insert";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";

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

  const value = parsed.data;
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
    p_attendee_ids: value.attendeeIds,
    p_recurrence_rule: payload.recurrence_rule,
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

  const item = await getNormalizedCalendarEvent(eventId, authenticatedUser.id);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The event was created but could not be reloaded." }, { status: 500 });
}
