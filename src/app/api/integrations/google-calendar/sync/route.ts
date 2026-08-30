import { NextResponse } from "next/server";
import { getGoogleCalendarActor, isSameOriginMutation } from "@/lib/google-calendar/auth";
import { GoogleCalendarReconnectRequiredError, syncGoogleCalendar } from "@/lib/google-calendar/sync";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getGoogleCalendarActor();
  if (!actor) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const result = await syncGoogleCalendar(actor);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof GoogleCalendarReconnectRequiredError) {
      return NextResponse.json({ error: "Google Calendar must be reconnected.", requiresReconnect: true }, { status: 409 });
    }
    return NextResponse.json({ error: "Google Calendar sync failed. StudioFlow data was not changed." }, { status: 502 });
  }
}
