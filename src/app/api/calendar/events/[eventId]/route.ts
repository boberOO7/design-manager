import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { canCreateCalendarEventType } from "@/lib/calendar-creation";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";
import { getBusinessTripTitle } from "@/lib/calendar-event-form";
import { scheduleGoogleCalendarReconciliation } from "@/lib/google-calendar/queue";

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership || (membership.system_role !== "admin" && membership.system_role !== "employee")) return NextResponse.json({ success: false, formError: "An active studio membership is required." }, { status: 403 });
  const { eventId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  let value = parsed.data.eventType === "site_visit"
    ? { ...parsed.data, assigneeId: membership.system_role === "admin" ? parsed.data.assigneeId : membership.authenticatedUserId }
    : parsed.data.eventType === "interview"
      ? { ...parsed.data, projectId: null, allDay: false, attendeeIds: [], participantIds: [], location: null, recurrenceRule: null, compensatesTimeOffRequestId: null, meetingMode: null }
    : parsed.data.eventType === "business_trip"
      ? { ...parsed.data, attendeeIds: [], assigneeId: null, meetingUrl: null, location: null, recurrenceRule: null, participantIds: membership.system_role === "admin" ? parsed.data.participantIds : [membership.authenticatedUserId] }
    : parsed.data.eventType === "meeting" || parsed.data.eventType === "presentation"
      ? { ...parsed.data, allDay: false, assigneeId: null, recurrenceRule: null, location: parsed.data.meetingMode === "offline" ? parsed.data.location : null, meetingUrl: parsed.data.meetingMode === "online" ? parsed.data.meetingUrl : null }
      : { ...parsed.data, assigneeId: null };
  const { data: existingEvent, error: existingEventError } = await supabase.from("calendar_events").select("organizer_id, recurrence_rule, event_type").eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).maybeSingle();
  if (existingEventError || !existingEvent) return NextResponse.json({ success: false, formError: "The event was not found or could not be updated." }, { status: 400 });
  if (!canCreateCalendarEventType(membership.system_role, value.eventType) && value.eventType !== existingEvent.event_type) {
    return NextResponse.json({ success: false, fieldErrors: { eventType: "This event type is not available for your role." } }, { status: 403 });
  }
  if (value.eventType === "interview" && membership.system_role !== "admin") {
    return NextResponse.json({ success: false, fieldErrors: { eventType: "Only administrators may manage interviews." } }, { status: 403 });
  }
  if (value.eventType === "business_trip") {
    if (value.participantIds.length === 0) return NextResponse.json({ success: false, fieldErrors: { participantIds: "Choose at least one business trip participant." } }, { status: 400 });
    const projectId = value.projectId;
    if (!projectId) return NextResponse.json({ success: false, fieldErrors: { projectId: "Choose an accessible project." } }, { status: 400 });
    const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).eq("studio_id", membership.studio_id).maybeSingle();
    if (!project) return NextResponse.json({ success: false, fieldErrors: { projectId: "Choose an accessible project." } }, { status: 400 });
    const { error: participantValidationError } = await supabase.rpc("validate_business_trip_participants", { p_studio_id: membership.studio_id, p_project_id: projectId, p_user_ids: value.participantIds });
    if (participantValidationError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(participantValidationError) }, { status: 400 });
    value = { ...value, title: getBusinessTripTitle(project.name, request.headers.get("accept-language")?.toLowerCase().startsWith("uk") ? "uk" : "en") };
  }
  if (value.scope === "this" && value.occurrenceStart && existingEvent.recurrence_rule) {
    const { data: override, error: overrideError } = await supabase.from("calendar_events").insert({ studio_id: membership.studio_id, project_id: value.projectId, title: value.title, description: value.description, event_type: value.eventType, starts_at: value.startsAt, ends_at: value.endsAt, all_day: value.allDay, location: value.location, meeting_url: value.meetingUrl, meeting_mode: value.meetingMode, compensates_time_off_request_id: value.compensatesTimeOffRequestId, assignee_id: value.assigneeId, created_by: membership.authenticatedUserId, organizer_id: existingEvent.organizer_id, series_id: eventId, occurrence_start: value.occurrenceStart }).select("id").single();
    if (overrideError || !override) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(overrideError) }, { status: 400 });
    scheduleGoogleCalendarReconciliation();
    const item = await getNormalizedCalendarEvent(override.id);
    return item ? NextResponse.json({ success: true, item }) : NextResponse.json({ success: false, formError: "The event could not be reloaded." }, { status: 500 });
  }
  const { data, error } = await supabase.from("calendar_events").update({
    title: value.title, event_type: value.eventType, project_id: value.projectId,
    starts_at: value.startsAt, ends_at: value.endsAt, all_day: value.allDay,
    location: value.location, meeting_url: value.meetingUrl, meeting_mode: value.meetingMode, description: value.description, recurrence_rule: value.recurrenceRule, compensates_time_off_request_id: value.compensatesTimeOffRequestId, assignee_id: value.assigneeId,
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

  if (value.eventType === "business_trip") {
    const { error: participantError } = await supabase.rpc("replace_business_trip_participants", { p_event_id: eventId, p_user_ids: value.participantIds });
    if (participantError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(participantError) }, { status: 400 });
  }
  if (existingEvent.event_type === "business_trip" && value.eventType !== "business_trip") {
    const { error: participantClearError } = await supabase.from("calendar_event_participants").delete().eq("event_id", eventId);
    if (participantClearError) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(participantClearError) }, { status: 400 });
  }

  scheduleGoogleCalendarReconciliation();
  const item = await getNormalizedCalendarEvent(eventId);
  return item ? NextResponse.json({ success: true, item }) : NextResponse.json({ success: false, formError: "The event could not be reloaded." }, { status: 500 });
}

export async function DELETE(_request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "An active studio membership is required." }, { status: 403 });
  const { eventId } = await context.params;
  const url = new URL(_request.url); const occurrenceStart = url.searchParams.get("occurrenceStart"); const scope = url.searchParams.get("scope");
  const supabase = await createClient();
  if (scope === "this" && occurrenceStart) {
    const { data: series, error: seriesError } = await supabase.from("calendar_events").select("studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, meeting_mode, organizer_id, recurrence_rule").eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).maybeSingle();
    if (seriesError || !series?.recurrence_rule) return NextResponse.json({ success: false, formError: "The recurring event was not found." }, { status: 400 });
    const { error } = await supabase.from("calendar_events").insert({ ...series, recurrence_rule: null, series_id: eventId, occurrence_start: occurrenceStart, created_by: membership.authenticatedUserId, cancelled_at: new Date().toISOString() });
    if (error) return NextResponse.json({ success: false, formError: "The occurrence could not be cancelled." }, { status: 400 });
    scheduleGoogleCalendarReconciliation();
    return NextResponse.json({ success: true, key: `calendar_event:${eventId}:${occurrenceStart}` });
  }
  const { data, error } = await supabase.from("calendar_events").update({ cancelled_at: new Date().toISOString() }).eq("id", eventId).eq("studio_id", membership.studio_id).is("cancelled_at", null).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, formError: "The event was not found or could not be cancelled." }, { status: 400 });
  scheduleGoogleCalendarReconciliation();
  return NextResponse.json({ success: true, key: `calendar_event:${eventId}` });
}
