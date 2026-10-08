import { NextResponse } from "next/server";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { scheduleGoogleCalendarReconciliation } from "@/lib/google-calendar/queue";

const responseSchema = z.object({ status: z.enum(["accepted", "declined"]) }).strict();

function unavailableInvitation() {
  return NextResponse.json({ success: false, errorCode: "INVITATION_UNAVAILABLE", error: "This invitation is unavailable. Refresh the calendar to see the latest event details." }, { status: 404 });
}

function persistenceFailure(error: PostgrestError, phase: "update" | "read", inviteId: string, userId: string) {
  console.error("calendar invitation response error", { phase, inviteId, userId, code: error.code, message: error.message, details: error.details, hint: error.hint });
  if (error.code === "P0001" && error.message === "Event invitations are unavailable") return unavailableInvitation();
  return NextResponse.json({ success: false, errorCode: "INVITATION_RESPONSE_FAILED", error: "Your response could not be saved. Please try again." }, { status: 500 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ success: false, errorCode: "INVITATION_AUTH_REQUIRED", error: "Authentication is required." }, { status: 401 });
  const membership = await getActiveStudioMembership();
  if (!membership || membership.authenticatedUserId !== userData.user.id) return unavailableInvitation();
  const { inviteId } = await params;
  if (!z.uuid().safeParse(inviteId).success) return NextResponse.json({ success: false, error: "Invalid invitation ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Choose a valid response." }, { status: 400 });
  const { data: updatedInvite, error } = await supabase.from("calendar_event_invites")
    .update({ status: parsed.data.status, responded_at: new Date().toISOString() })
    .eq("id", inviteId).eq("user_id", userData.user.id).neq("status", parsed.data.status).select("event_id").maybeSingle();
  if (error) return persistenceFailure(error, "update", inviteId, userData.user.id);
  let eventId = updatedInvite?.event_id;
  if (!eventId) {
    // A retry may repeat an RSVP already saved from Calendar or Notifications.
    // Keep the write filter: the database trigger rejects unchanged statuses.
    const { data: existingInvite, error: readError } = await supabase.from("calendar_event_invites")
      .select("event_id, event:calendar_events!inner(studio_id, cancelled_at)")
      .eq("id", inviteId).eq("user_id", userData.user.id).eq("status", parsed.data.status)
      .eq("event.studio_id", membership.studio_id).maybeSingle();
    if (readError) return persistenceFailure(readError, "read", inviteId, userData.user.id);
    if (!existingInvite || existingInvite.event.cancelled_at) {
      console.warn("calendar invitation response unavailable", { inviteId, userId: userData.user.id, requestedStatus: parsed.data.status, reason: existingInvite ? "event_cancelled" : "no_matching_visible_invitation" });
      return unavailableInvitation();
    }
    eventId = existingInvite.event_id;
  } else {
    scheduleGoogleCalendarReconciliation();
  }
  const item = await getNormalizedCalendarEvent(eventId);
  return NextResponse.json({ success: true, item });
}
