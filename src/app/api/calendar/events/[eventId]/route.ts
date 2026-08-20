import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "An active studio membership is required." }, { status: 403 });
  const { eventId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  const value = parsed.data;
  const { data: existingEvent, error: existingEventError } = await supabase.from("calendar_events").select("organizer_id").eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).maybeSingle();
  if (existingEventError || !existingEvent) return NextResponse.json({ success: false, formError: "The event was not found or could not be updated." }, { status: 400 });
  const { data, error } = await supabase.from("calendar_events").update({
    title: value.title, event_type: value.eventType, project_id: value.projectId,
    starts_at: value.startsAt, ends_at: value.endsAt, all_day: value.allDay,
    location: value.location, meeting_url: value.meetingUrl, description: value.description,
  }).eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });

  const inviteeIds = [...new Set(value.attendeeIds)].filter((userId) => userId !== existingEvent.organizer_id);
  const { data: existingInvites, error: invitesReadError } = await supabase.from("calendar_event_invites").select("user_id").eq("event_id", eventId);
  if (invitesReadError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(invitesReadError) }, { status: 400 });
  const existingIds = new Set((existingInvites ?? []).map((invite) => invite.user_id));
  const nextIds = new Set(inviteeIds);
  const removedIds = [...existingIds].filter((id) => !nextIds.has(id));
  const addedIds = inviteeIds.filter((id) => !existingIds.has(id));
  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from("calendar_event_invites").delete().eq("event_id", eventId).in("user_id", removedIds);
    if (deleteError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(deleteError) }, { status: 400 });
  }
  if (addedIds.length > 0) {
    const { error: inviteError } = await supabase.from("calendar_event_invites").insert(addedIds.map((userId) => ({ event_id: eventId, user_id: userId, invited_by: membership.authenticatedUserId })));
    if (inviteError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(inviteError) }, { status: 400 });
  }

  const item = await getNormalizedCalendarEvent(eventId, membership.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }) : NextResponse.json({ success: false, formError: "The event could not be reloaded." }, { status: 500 });
}

export async function DELETE(_request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "An active studio membership is required." }, { status: 403 });
  const { eventId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_events").update({ cancelled_at: new Date().toISOString() }).eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, formError: "The event was not found or could not be cancelled." }, { status: 400 });
  return NextResponse.json({ success: true, key: `calendar_event:${eventId}` });
}
