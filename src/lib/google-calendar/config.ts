import "server-only";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

export const GOOGLE_CALENDAR_STATE_COOKIE = "studioflow_google_calendar_oauth_state";
export const GOOGLE_CALENDAR_STATE_COOKIE_PATH = "/api/integrations/google-calendar";

export function getGoogleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar OAuth configuration is incomplete.");
  }

  return { clientId, clientSecret, redirectUri };
}
