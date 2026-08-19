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
  const plainInsertDiagnostic = process.env.NODE_ENV === "development";

  console.info("calendar_events insert diagnostic", {
    authenticatedUserId: authenticatedUser.id,
    membershipUserId: membership.userId,
    membershipStudioId: membership.studioId,
    membershipSystemRole: membership.systemRole,
    membershipIsActive: membership.isActive,
    insertCreatedBy: payload.created_by,
    insertStudioId: payload.studio_id,
    insertProjectId: payload.project_id,
    eventType: payload.event_type,
    usesSelectAfterInsert: !plainInsertDiagnostic,
    authenticatedUserMatchesInsertCreatedBy: authenticatedUser.id === payload.created_by,
    membershipStudioMatchesInsertStudio: membership.studioId === payload.studio_id,
  });

  if (plainInsertDiagnostic) {
    const { error } = await supabase.from("calendar_events").insert(payload);
    if (error) {
      console.error("calendar_events plain insert diagnostic error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });
    }

    return NextResponse.json({ success: true, requiresRefresh: true }, { status: 201 });
  }

  const { data: event, error } = await supabase.from("calendar_events").insert(payload);
  if (error) {
    console.error("calendar_events insert and select error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
  if (error || !event) return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(error) }, { status: 400 });

  const attendeeIds = [...new Set(value.attendeeIds)];
  if (attendeeIds.length > 0) {
    const { error: attendeeError } = await supabase.from("calendar_event_attendees").insert(attendeeIds.map((userId) => ({ event_id: event.id, user_id: userId })));
    if (attendeeError) {
      await supabase.from("calendar_events").update({ cancelled_at: new Date().toISOString() }).eq("id", event.id);
      return NextResponse.json({ success: false, ...getCalendarEventPersistenceError(attendeeError) }, { status: 400 });
    }
  }

  const item = await getNormalizedCalendarEvent(event.id, authenticatedUser.id);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The event was created but could not be reloaded." }, { status: 500 });
}
