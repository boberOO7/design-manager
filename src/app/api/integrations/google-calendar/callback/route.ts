import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { APPLICATION_TIME_ZONE } from "@/lib/calendar";
import { getGoogleCalendarActor } from "@/lib/google-calendar/auth";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/google-calendar/crypto";
import { GOOGLE_CALENDAR_STATE_COOKIE, GOOGLE_CALENDAR_STATE_COOKIE_PATH } from "@/lib/google-calendar/config";
import {
  atGoogleCalendarStage,
  GoogleCalendarSyncError,
  logGoogleCalendarFailure,
} from "@/lib/google-calendar/diagnostics";
import {
  classifyGoogleCalendarDeleteFailure,
  googleCalendarName,
  GoogleCalendarAuthorizationUnavailableError,
  runGoogleCalendarDisconnectLifecycle,
} from "@/lib/google-calendar/lifecycle";
import { createGoogleOAuthClient } from "@/lib/google-calendar/oauth";
import { syncGoogleCalendar } from "@/lib/google-calendar/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function callbackRedirect(request: Request, result: string) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("googleCalendar", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: GOOGLE_CALENDAR_STATE_COOKIE_PATH,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function stateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  if (!stateMatches(url.searchParams.get("state"), cookieStore.get(GOOGLE_CALENDAR_STATE_COOKIE)?.value)) {
    return callbackRedirect(request, "invalid_state");
  }
  if (url.searchParams.has("error")) return callbackRedirect(request, "denied");

  const code = url.searchParams.get("code");
  if (!code) return callbackRedirect(request, "missing_code");
  const actor = await getGoogleCalendarActor();
  if (!actor) return callbackRedirect(request, "authentication_required");

  const admin = createAdminClient();
  const baseContext = { studioId: actor.membership.studio_id, userId: actor.user.id };
  let createdCalendarId: string | null = null;
  let connectionStored = false;
  let oauth: ReturnType<typeof createGoogleOAuthClient> | null = null;
  let refreshToken: string | null = null;

  try {
    oauth = createGoogleOAuthClient();
    const activeOauth = oauth;
    const tokenResponse = await atGoogleCalendarStage(
      "connect.token_exchange",
      "google.oauth.getToken",
      baseContext,
      () => activeOauth.getToken(code),
    );
    refreshToken = tokenResponse.tokens.refresh_token ?? null;
    if (!refreshToken) return callbackRedirect(request, "missing_refresh_token");
    activeOauth.setCredentials(tokenResponse.tokens);

    const identity = await atGoogleCalendarStage(
      "connect.identity",
      "google.oauth2.userinfo.get",
      baseContext,
      () => google.oauth2({ version: "v2", auth: activeOauth }).userinfo.get(),
    );
    const googleEmail = identity.data.email;
    if (!googleEmail) return callbackRedirect(request, "missing_google_email");

    const { data: existing, error: existingError } = await admin
      .from("google_calendar_connections")
      .select("id, google_account_email, google_calendar_id, studio_id, user_id")
      .eq("user_id", actor.user.id)
      .eq("studio_id", actor.membership.studio_id)
      .maybeSingle();
    if (existingError) {
      throw new GoogleCalendarSyncError(
        "connect.connection_load",
        "db.select.google_calendar_connections",
        existingError,
        baseContext,
      );
    }

    const currentCalendar = google.calendar({ version: "v3", auth: activeOauth });
    if (existing) {
      const existingContext = { connectionId: existing.id, studioId: existing.studio_id, userId: existing.user_id };
      let previousOauth: ReturnType<typeof createGoogleOAuthClient> | null = null;
      let previousRefreshToken: string | null = null;

      if (existing.google_account_email !== googleEmail) {
        const { data: previousCredential, error: previousCredentialError } = await admin
          .from("google_calendar_server_credentials")
          .select("encrypted_refresh_token")
          .eq("connection_id", existing.id)
          .maybeSingle();
        if (previousCredentialError) {
          throw new GoogleCalendarSyncError(
            "connect.previous_credentials_load",
            "db.select.google_calendar_server_credentials",
            previousCredentialError,
            existingContext,
          );
        }
        if (previousCredential) {
          try {
            previousRefreshToken = decryptRefreshToken(previousCredential.encrypted_refresh_token);
            previousOauth = createGoogleOAuthClient();
            previousOauth.setCredentials({ refresh_token: previousRefreshToken });
          } catch (error) {
            logGoogleCalendarFailure(new GoogleCalendarSyncError(
              "connect.previous_credentials_decrypt",
              "decrypt_refresh_token",
              error,
              existingContext,
            ));
          }
        }
      }

      const retirementCalendar = existing.google_account_email === googleEmail
        ? currentCalendar
        : previousOauth ? google.calendar({ version: "v3", auth: previousOauth }) : null;
      await runGoogleCalendarDisconnectLifecycle({
        deleteRemoteCalendar: async () => {
          if (!retirementCalendar) {
            throw new GoogleCalendarAuthorizationUnavailableError("Stored Google authorization is unavailable.");
          }
          await atGoogleCalendarStage(
            "connect.previous_calendar_delete",
            "google.calendars.delete",
            existingContext,
            () => retirementCalendar.calendars.delete({ calendarId: existing.google_calendar_id }),
          );
        },
        removeMappings: async () => {
          const { error } = await admin.from("google_calendar_event_mappings")
            .delete().eq("connection_id", existing.id);
          if (error) {
            throw new GoogleCalendarSyncError(
              "connect.previous_mapping_cleanup",
              "db.delete.google_calendar_event_mappings",
              error,
              existingContext,
            );
          }
        },
        revokeCredentials: async () => {
          if (!previousOauth || !previousRefreshToken) return;
          await atGoogleCalendarStage(
            "connect.previous_credentials_revoke",
            "google.oauth.revokeToken",
            existingContext,
            () => previousOauth.revokeToken(previousRefreshToken),
          );
        },
        removeConnection: async () => {
          const { error } = await admin.from("google_calendar_connections")
            .delete().eq("id", existing.id).eq("user_id", actor.user.id);
          if (error) {
            throw new GoogleCalendarSyncError(
              "connect.previous_connection_cleanup",
              "db.delete.google_calendar_connections",
              error,
              existingContext,
            );
          }
        },
        reportIgnoredFailure: (stage, error) => {
          if (stage === "calendar_delete" && classifyGoogleCalendarDeleteFailure(error) === "missing") return;
          logGoogleCalendarFailure(error, existingContext);
        },
      });
    }

    const connectionId = randomUUID();
    const connectionContext = { ...baseContext, connectionId };
    const calendarName = googleCalendarName(actor.membership.studioName);
    const created = await atGoogleCalendarStage(
      "connect.calendar_create",
      "google.calendars.insert",
      connectionContext,
      () => currentCalendar.calendars.insert({
        requestBody: { summary: calendarName, timeZone: APPLICATION_TIME_ZONE },
      }),
    );
    createdCalendarId = created.data.id ?? null;
    if (!createdCalendarId) {
      throw new GoogleCalendarSyncError(
        "connect.calendar_create",
        "google.calendars.insert.response",
        new Error("Google Calendar did not return a calendar ID."),
        connectionContext,
      );
    }

    const { error: connectionError } = await admin.from("google_calendar_connections").insert({
      id: connectionId,
      user_id: actor.user.id,
      studio_id: actor.membership.studio_id,
      google_account_email: googleEmail,
      google_calendar_id: createdCalendarId,
      google_calendar_name: calendarName,
      google_calendar_timezone: APPLICATION_TIME_ZONE,
      granted_scopes: tokenResponse.tokens.scope?.split(" ").filter(Boolean) ?? [],
      status: "active",
      last_sync_error: null,
    });
    if (connectionError) {
      throw new GoogleCalendarSyncError(
        "connect.connection_save",
        "db.insert.google_calendar_connections",
        connectionError,
        connectionContext,
      );
    }

    const { error: credentialError } = await admin.from("google_calendar_server_credentials").insert({
      connection_id: connectionId,
      encrypted_refresh_token: encryptRefreshToken(refreshToken),
    });
    if (credentialError) {
      await admin.from("google_calendar_connections").delete().eq("id", connectionId);
      throw new GoogleCalendarSyncError(
        "connect.credentials_save",
        "db.insert.google_calendar_server_credentials",
        credentialError,
        connectionContext,
      );
    }
    connectionStored = true;

    try {
      await syncGoogleCalendar(actor);
    } catch (error) {
      // The connection remains usable and the manual repair action can retry a
      // transient full reconciliation without creating another calendar.
      logGoogleCalendarFailure(error, connectionContext);
    }

    return callbackRedirect(request, "connected");
  } catch (error) {
    logGoogleCalendarFailure(error, baseContext);
    if (createdCalendarId && oauth && !connectionStored) {
      const cleanupCalendar = google.calendar({ version: "v3", auth: oauth });
      try {
        await cleanupCalendar.calendars.delete({ calendarId: createdCalendarId });
      } catch (cleanupError) {
        if (classifyGoogleCalendarDeleteFailure(cleanupError) !== "missing") {
          logGoogleCalendarFailure(new GoogleCalendarSyncError(
            "connect.failed_calendar_cleanup",
            "google.calendars.delete",
            cleanupError,
            baseContext,
          ));
        }
      }
      if (refreshToken) {
        try {
          await oauth.revokeToken(refreshToken);
        } catch (revokeError) {
          logGoogleCalendarFailure(new GoogleCalendarSyncError(
            "connect.failed_credentials_revoke",
            "google.oauth.revokeToken",
            revokeError,
            baseContext,
          ));
        }
      }
    }
    return callbackRedirect(request, "callback_failed");
  }
}
