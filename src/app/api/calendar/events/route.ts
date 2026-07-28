import { NextResponse } from "next/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";

export async function POST(request: Request) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  const value = parsed.data;
  const { data: event, error } = await supabase.from("calendar_events").insert({
    studio_id: admin.studio_id, created_by: admin.authenticatedUserId, title: value.title,
    event_type: value.eventType, project_id: value.projectId, starts_at: value.startsAt,
    ends_at: value.endsAt, all_day: value.allDay, location: value.location,
    meeting_url: value.meetingUrl, description: value.description,
  }).select("id").single();
  if (error || !event) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });

  const attendeeIds = [...new Set(value.attendeeIds)];
  if (attendeeIds.length > 0) {
    const { error: attendeeError } = await supabase.from("calendar_event_attendees").insert(attendeeIds.map((userId) => ({ event_id: event.id, user_id: userId })));
    if (attendeeError) {
      await supabase.from("calendar_events").update({ cancelled_at: new Date().toISOString() }).eq("id", event.id);
      return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(attendeeError) }, { status: 400 });
    }
  }

  const item = await getNormalizedCalendarEvent(event.id, admin.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The event was created but could not be reloaded." }, { status: 500 });
}
