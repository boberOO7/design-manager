import { NextResponse } from "next/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, context: Context) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });
  const { eventId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  const value = parsed.data;
  const { data, error } = await supabase.from("calendar_events").update({
    title: value.title, event_type: value.eventType, project_id: value.projectId,
    starts_at: value.startsAt, ends_at: value.endsAt, all_day: value.allDay,
    location: value.location, meeting_url: value.meetingUrl, description: value.description,
  }).eq("id", eventId).eq("studio_id", admin.studio_id).is("cancelled_at", null).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });

  const attendeeIds = [...new Set(value.attendeeIds)];
  const { data: existingAttendees, error: attendeesReadError } = await supabase.from("calendar_event_attendees").select("user_id").eq("event_id", eventId);
  if (attendeesReadError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(attendeesReadError) }, { status: 400 });
  const existingIds = new Set((existingAttendees ?? []).map((attendee) => attendee.user_id));
  const nextIds = new Set(attendeeIds);
  const removedIds = [...existingIds].filter((id) => !nextIds.has(id));
  const addedIds = attendeeIds.filter((id) => !existingIds.has(id));
  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from("calendar_event_attendees").delete().eq("event_id", eventId).in("user_id", removedIds);
    if (deleteError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(deleteError) }, { status: 400 });
  }
  if (addedIds.length > 0) {
    const { error: attendeeError } = await supabase.from("calendar_event_attendees").insert(addedIds.map((userId) => ({ event_id: eventId, user_id: userId })));
    if (attendeeError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(attendeeError) }, { status: 400 });
  }

  const item = await getNormalizedCalendarEvent(eventId, admin.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }) : NextResponse.json({ success: false, formError: "The event could not be reloaded." }, { status: 500 });
}

export async function DELETE(_request: Request, context: Context) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });
  const { eventId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_events").update({ cancelled_at: new Date().toISOString() }).eq("id", eventId).eq("studio_id", admin.studio_id).is("cancelled_at", null).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, formError: "The event was not found or could not be cancelled." }, { status: 400 });
  return NextResponse.json({ success: true, key: `calendar_event:${eventId}` });
}
