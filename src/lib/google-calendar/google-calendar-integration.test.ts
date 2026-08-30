import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260830130000_google_calendar_phase_one.sql");
const connectRoute = read("src/app/api/integrations/google-calendar/connect/route.ts");
const callbackRoute = read("src/app/api/integrations/google-calendar/callback/route.ts");
const sync = read("src/lib/google-calendar/sync.ts");
const disconnectRoute = read("src/app/api/integrations/google-calendar/disconnect/route.ts");
const tokenCrypto = read("src/lib/google-calendar/crypto.ts");

describe("Google Calendar Phase 1 security and projection contract", () => {
  it("encrypts refresh tokens with authenticated encryption and never returns them from status", () => {
    expect(tokenCrypto).toContain('const ALGORITHM = "aes-256-gcm"');
    expect(tokenCrypto).toContain("randomBytes(12)");
    expect(tokenCrypto).toContain("getAuthTag()");
    expect(tokenCrypto).toContain("setAuthTag");
    expect(read("src/app/api/integrations/google-calendar/status/route.ts")).not.toContain("encrypted_refresh_token");
  });

  it("uses offline consent and a short-lived HttpOnly state cookie without putting identity in OAuth state", () => {
    expect(connectRoute).toContain('access_type: "offline"');
    expect(connectRoute).toContain("include_granted_scopes: true");
    expect(connectRoute).toContain('prompt: "consent"');
    expect(connectRoute).toContain("httpOnly: true");
    expect(connectRoute).toContain("maxAge: 10 * 60");
    expect(callbackRoute).toContain("timingSafeEqual");
    expect(connectRoute).not.toContain("studio_id");
    expect(connectRoute).not.toContain("user_id");
    expect(read("src/app/api/integrations/google-calendar/sync/route.ts")).toContain("isSameOriginMutation(request)");
    expect(disconnectRoute).toContain("isSameOriginMutation(request)");
  });

  it("keeps credentials and mappings server-only while metadata is readable only by its owner", () => {
    expect(migration).toContain("google_calendar_connections_select_own");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("private.is_studio_member(studio_id)");
    expect(migration).toContain("revoke all on table public.google_calendar_server_credentials from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.google_calendar_server_credentials to service_role");
    expect(migration).not.toContain("grant select on table public.google_calendar_server_credentials to authenticated");
  });

  it("projects only RLS-visible calendar_events with timed/all-day semantics and private source markers", () => {
    expect(sync).toContain('.from("calendar_events")');
    expect(sync).not.toContain("time_off_requests");
    expect(sync).not.toContain("project_deadline");
    expect(sync).not.toContain("task_deadline");
    expect(sync).toContain("? { date: instantToDateOnly(startsAt) }");
    expect(sync).toContain("{ dateTime: startsAt, timeZone: APPLICATION_TIME_ZONE }");
    expect(sync).toContain("studioflowSourceKey");
    expect(sync).not.toContain("attendees:");
  });

  it("combines per-connection mappings with deterministic Google IDs for idempotency", () => {
    expect(migration).toContain("unique (connection_id, source_key)");
    expect(sync).toContain('createHash("sha256")');
    expect(sync).toContain("projectionEventId(connection.id, projection.sourceKey)");
    expect(sync).toContain("events.update");
    expect(sync).toContain("events.delete");
  });

  it("revokes Google authorization and removes only integration records on disconnect", () => {
    expect(disconnectRoute).toContain("revokeToken");
    expect(disconnectRoute).toContain('.from("google_calendar_connections")');
    expect(disconnectRoute).not.toContain('.from("calendar_events").delete');
  });
});
