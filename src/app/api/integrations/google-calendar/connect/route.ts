import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getGoogleCalendarActor } from "@/lib/google-calendar/auth";
import { GOOGLE_CALENDAR_SCOPES, GOOGLE_CALENDAR_STATE_COOKIE, GOOGLE_CALENDAR_STATE_COOKIE_PATH } from "@/lib/google-calendar/config";
import { createGoogleOAuthClient } from "@/lib/google-calendar/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getGoogleCalendarActor();
  if (!actor) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(32).toString("base64url");
  let authorizationUrl: string;
  try {
    authorizationUrl = createGoogleOAuthClient().generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: [...GOOGLE_CALENDAR_SCOPES],
      state,
    });
  } catch {
    return NextResponse.redirect(new URL("/dashboard?googleCalendar=configuration_error", request.url));
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: GOOGLE_CALENDAR_STATE_COOKIE_PATH,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
