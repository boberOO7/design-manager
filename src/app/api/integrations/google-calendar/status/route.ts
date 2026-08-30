import { NextResponse } from "next/server";
import { getGoogleCalendarActor } from "@/lib/google-calendar/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getGoogleCalendarActor();
  if (!actor) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const { data, error } = await actor.supabase
    .from("google_calendar_connections")
    .select("google_account_email, google_calendar_name, google_calendar_timezone, status, last_sync_at, last_sync_error")
    .eq("user_id", actor.user.id)
    .eq("studio_id", actor.membership.studio_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load Google Calendar status." }, { status: 500 });
  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    email: data.google_account_email,
    calendarName: data.google_calendar_name,
    calendarTimeZone: data.google_calendar_timezone,
    requiresReconnect: data.status === "reconnect_required",
    lastSyncAt: data.last_sync_at,
    lastSyncError: data.last_sync_error,
  });
}
