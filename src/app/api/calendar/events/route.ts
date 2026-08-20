import { NextResponse } from "next/server";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createCalendarEventInsertPayload, verifyCalendarEventAdminMembership } from "@/lib/calendar-event-insert";
import { createClient } from "@/lib/supabase/server";
import { calendarEventSchema, calendarFieldErrors, getCalendarEventPersistenceError } from "@/lib/validation/calendar";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CalendarSupabaseClient = SupabaseClient<Database>;

async function getVerifiedActiveAdminMembership(supabase: CalendarSupabaseClient, authenticatedUserId: string) {
  const { data, error } = await supabase
    .from("studio_members")
    .select("user_id, studio_id, system_role, is_active")
    .eq("user_id", authenticatedUserId)
    .eq("is_active", true)
    .eq("system_role", "admin")
    .limit(2);

  if (error || !data || data.length !== 1) return null;

  const membership = data[0];
  if (membership.system_role !== "admin") return null;

  return verifyCalendarEventAdminMembership({
    userId: membership.user_id,
    studioId: membership.studio_id,
    systemRole: membership.system_role,
    isActive: membership.is_active,
  }, authenticatedUserId);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authenticatedUser = userData.user;
  if (userError || !authenticatedUser) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });

  const membership = await getVerifiedActiveAdminMembership(supabase, authenticatedUser.id);
  if (!membership) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const value = parsed.data;
  const payload = createCalendarEventInsertPayload(value, authenticatedUser.id, membership);

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
