import "server-only";

import { google } from "googleapis";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";

export function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleCalendarConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function isReconnectRequiredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /invalid_grant|invalid credentials|unauthorized|token has been expired or revoked|login required/i.test(error.message);
}
