import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleCalendarActor } from "@/lib/google-calendar/auth";
import { APPLICATION_TIME_ZONE } from "@/lib/calendar";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/google-calendar/crypto";
import { GOOGLE_CALENDAR_STATE_COOKIE, GOOGLE_CALENDAR_STATE_COOKIE_PATH } from "@/lib/google-calendar/config";
import { createGoogleOAuthClient } from "@/lib/google-calendar/oauth";
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

function isMissingCalendar(error: unknown): boolean {
  return error instanceof Error && /\b404\b|not found/i.test(error.message);
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

  try {
    const oauth = createGoogleOAuthClient();
    const tokenResponse = await oauth.getToken(code);
    const refreshToken = tokenResponse.tokens.refresh_token;
    if (!refreshToken) return callbackRedirect(request, "missing_refresh_token");
    oauth.setCredentials(tokenResponse.tokens);

    const identity = await google.oauth2({ version: "v2", auth: oauth }).userinfo.get();
    const googleEmail = identity.data.email;
    if (!googleEmail) return callbackRedirect(request, "missing_google_email");

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("google_calendar_connections")
      .select("id, google_account_email, google_calendar_id, google_calendar_name, google_calendar_timezone")
      .eq("user_id", actor.user.id)
      .eq("studio_id", actor.membership.studio_id)
      .maybeSingle();
    if (existingError) throw new Error("Unable to inspect the existing Google Calendar connection.", { cause: existingError });
    const { data: previousCredential } = existing && existing.google_account_email !== googleEmail
      ? await admin.from("google_calendar_server_credentials").select("encrypted_refresh_token").eq("connection_id", existing.id).maybeSingle()
      : { data: null };

    const calendar = google.calendar({ version: "v3", auth: oauth });
    const calendarName = `StudioFlow · ${actor.membership.studioName}`;
    let calendarId: string | null = null;
    if (existing?.google_account_email === googleEmail) {
      try {
        const response = await calendar.calendars.get({ calendarId: existing.google_calendar_id });
        const resolvedCalendarId = response.data.id ?? existing.google_calendar_id;
        await calendar.calendars.update({
          calendarId: resolvedCalendarId,
          requestBody: { summary: calendarName, timeZone: APPLICATION_TIME_ZONE },
        });
        calendarId = resolvedCalendarId;
      } catch (error) {
        if (!isMissingCalendar(error)) throw error;
      }
    }
    if (!calendarId) {
      const created = await calendar.calendars.insert({
        requestBody: { summary: calendarName, timeZone: APPLICATION_TIME_ZONE },
      });
      calendarId = created.data.id ?? null;
    }
    if (!calendarId) throw new Error("Google Calendar did not return a calendar ID.");

    const connectionId = existing?.id ?? randomUUID();
    const connectionRecord = {
      id: connectionId,
      user_id: actor.user.id,
      studio_id: actor.membership.studio_id,
      google_account_email: googleEmail,
      google_calendar_id: calendarId,
      google_calendar_name: calendarName,
      google_calendar_timezone: APPLICATION_TIME_ZONE,
      granted_scopes: tokenResponse.tokens.scope?.split(" ").filter(Boolean) ?? [],
      status: "active" as const,
      last_sync_error: null,
    };
    const encryptedRefreshToken = encryptRefreshToken(refreshToken);

    if (existing) {
      const { error: credentialError } = await admin.from("google_calendar_server_credentials").upsert({
        connection_id: connectionId,
        encrypted_refresh_token: encryptedRefreshToken,
      });
      if (credentialError) throw new Error("Unable to store Google authorization securely.", { cause: credentialError });
      const { error: connectionError } = await admin.from("google_calendar_connections").update({
        user_id: connectionRecord.user_id,
        studio_id: connectionRecord.studio_id,
        google_account_email: connectionRecord.google_account_email,
        google_calendar_id: connectionRecord.google_calendar_id,
        google_calendar_name: connectionRecord.google_calendar_name,
        google_calendar_timezone: connectionRecord.google_calendar_timezone,
        granted_scopes: connectionRecord.granted_scopes,
        status: connectionRecord.status,
        last_sync_error: connectionRecord.last_sync_error,
      }).eq("id", connectionId);
      if (connectionError) throw new Error("Unable to update Google Calendar connection metadata.", { cause: connectionError });
    } else {
      const { error: connectionError } = await admin.from("google_calendar_connections").insert(connectionRecord);
      if (connectionError) throw new Error("Unable to store Google Calendar connection metadata.", { cause: connectionError });
      const { error: credentialError } = await admin.from("google_calendar_server_credentials").insert({
        connection_id: connectionId,
        encrypted_refresh_token: encryptedRefreshToken,
      });
      if (credentialError) {
        await admin.from("google_calendar_connections").delete().eq("id", connectionId);
        throw new Error("Unable to store Google authorization securely.", { cause: credentialError });
      }
    }

    if (previousCredential) {
      try {
        await createGoogleOAuthClient().revokeToken(decryptRefreshToken(previousCredential.encrypted_refresh_token));
      } catch {
        // The old account token is no longer stored locally. Revocation remains
        // best-effort if Google already invalidated it or is temporarily unavailable.
      }
    }

    return callbackRedirect(request, "connected");
  } catch {
    return callbackRedirect(request, "callback_failed");
  }
}
