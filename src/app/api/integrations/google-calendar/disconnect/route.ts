import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleCalendarActor, isSameOriginMutation } from "@/lib/google-calendar/auth";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import {
  atGoogleCalendarStage,
  getGoogleCalendarFailureDiagnostic,
  GoogleCalendarSyncError,
  logGoogleCalendarFailure,
} from "@/lib/google-calendar/diagnostics";
import {
  classifyGoogleCalendarDeleteFailure,
  GoogleCalendarAuthorizationUnavailableError,
  runGoogleCalendarDisconnectLifecycle,
} from "@/lib/google-calendar/lifecycle";
import { createGoogleOAuthClient } from "@/lib/google-calendar/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getGoogleCalendarActor();
  if (!actor) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("google_calendar_connections")
    .select("id, google_calendar_id, studio_id, user_id")
    .eq("user_id", actor.user.id)
    .eq("studio_id", actor.membership.studio_id)
    .maybeSingle();
  if (connectionError) {
    logGoogleCalendarFailure(new GoogleCalendarSyncError(
      "disconnect.connection_load",
      "db.select.google_calendar_connections",
      connectionError,
      { studioId: actor.membership.studio_id, userId: actor.user.id },
    ));
    return NextResponse.json({ error: "Unable to disconnect Google Calendar." }, { status: 500 });
  }
  if (!connection) return NextResponse.json({ success: true });

  const context = {
    connectionId: connection.id,
    studioId: connection.studio_id,
    userId: connection.user_id,
  };
  const { data: credential, error: credentialError } = await admin
    .from("google_calendar_server_credentials")
    .select("encrypted_refresh_token")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (credentialError) {
    logGoogleCalendarFailure(new GoogleCalendarSyncError(
      "disconnect.credentials_load",
      "db.select.google_calendar_server_credentials",
      credentialError,
      context,
    ));
    return NextResponse.json({ error: "Unable to disconnect Google Calendar." }, { status: 500 });
  }

  let refreshToken: string | null = null;
  if (credential) {
    try {
      refreshToken = decryptRefreshToken(credential.encrypted_refresh_token);
    } catch (error) {
      logGoogleCalendarFailure(new GoogleCalendarSyncError(
        "disconnect.credentials_decrypt",
        "decrypt_refresh_token",
        error,
        context,
      ));
    }
  }

  let oauth: ReturnType<typeof createGoogleOAuthClient> | null = null;
  if (refreshToken) {
    try {
      oauth = createGoogleOAuthClient();
    } catch (error) {
      logGoogleCalendarFailure(new GoogleCalendarSyncError(
        "disconnect.credentials_initialize",
        "google.oauth.initialize",
        error,
        context,
      ));
    }
  }
  if (oauth && refreshToken) oauth.setCredentials({ refresh_token: refreshToken });
  const calendar = oauth ? google.calendar({ version: "v3", auth: oauth }) : null;

  try {
    const result = await runGoogleCalendarDisconnectLifecycle({
      deleteRemoteCalendar: async () => {
        if (!calendar) throw new GoogleCalendarAuthorizationUnavailableError("Stored Google authorization is unavailable.");
        await atGoogleCalendarStage(
          "disconnect.calendar_delete",
          "google.calendars.delete",
          context,
          () => calendar.calendars.delete({ calendarId: connection.google_calendar_id }),
        );
      },
      removeMappings: async () => {
        const { error } = await admin.from("google_calendar_event_mappings")
          .delete().eq("connection_id", connection.id);
        if (error) {
          throw new GoogleCalendarSyncError(
            "disconnect.mapping_cleanup",
            "db.delete.google_calendar_event_mappings",
            error,
            context,
          );
        }
      },
      revokeCredentials: async () => {
        if (!oauth || !refreshToken) return;
        await atGoogleCalendarStage(
          "disconnect.credentials_revoke",
          "google.oauth.revokeToken",
          context,
          () => oauth.revokeToken(refreshToken),
        );
      },
      removeConnection: async () => {
        const { error } = await admin.from("google_calendar_connections")
          .delete()
          .eq("id", connection.id)
          .eq("user_id", actor.user.id)
          .eq("studio_id", actor.membership.studio_id);
        if (error) {
          throw new GoogleCalendarSyncError(
            "disconnect.connection_cleanup",
            "db.delete.google_calendar_connections",
            error,
            context,
          );
        }
      },
      reportIgnoredFailure: (stage, error) => {
        if (stage === "calendar_delete" && classifyGoogleCalendarDeleteFailure(error) === "missing") return;
        logGoogleCalendarFailure(error, context);
      },
    });
    return NextResponse.json({ success: true, remoteCalendar: result.remoteCalendar });
  } catch (error) {
    logGoogleCalendarFailure(error, context);
    const diagnostic = getGoogleCalendarFailureDiagnostic(error);
    const status = diagnostic.operation.startsWith("db.") ? 500 : 502;
    return NextResponse.json({ error: "Unable to disconnect Google Calendar. Try again." }, { status });
  }
}
