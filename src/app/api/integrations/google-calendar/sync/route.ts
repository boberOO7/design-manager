import { NextResponse } from "next/server";
import { getGoogleCalendarActor, isSameOriginMutation } from "@/lib/google-calendar/auth";
import { getGoogleCalendarFailureDiagnostic, logGoogleCalendarFailure } from "@/lib/google-calendar/diagnostics";
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
    logGoogleCalendarFailure(error, {
      studioId: actor.membership.studio_id,
      userId: actor.user.id,
    });
    if (process.env.NODE_ENV !== "production") {
      const diagnostic = getGoogleCalendarFailureDiagnostic(error);
      return NextResponse.json({
        error: "Google Calendar sync failed. StudioFlow data was not changed.",
        diagnostic: {
          stage: diagnostic.stage,
          operation: diagnostic.operation,
          message: diagnostic.message,
          httpStatus: diagnostic.httpStatus,
          code: diagnostic.code,
          reason: diagnostic.reason,
        },
      }, { status: 502 });
    }
    return NextResponse.json({ error: "Google Calendar sync failed. StudioFlow data was not changed." }, { status: 502 });
  }
}
