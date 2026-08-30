import "server-only";

import { createHash } from "node:crypto";
import { calendar_v3, google } from "googleapis";
import { addCalendarDays, APPLICATION_TIME_ZONE, instantToDateOnly, zonedWallTimeToIso } from "@/lib/calendar";
import { occurrenceBounds, parseRecurrenceRule, recurrenceDates } from "@/lib/calendar-recurrence";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import { isReconnectRequiredError, createGoogleOAuthClient } from "@/lib/google-calendar/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { getGoogleCalendarActor } from "@/lib/google-calendar/auth";
import type { Database } from "@/types/database.types";

type GoogleCalendarActor = NonNullable<Awaited<ReturnType<typeof getGoogleCalendarActor>>>;
type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];
type Projection = {
  sourceEventId: string;
  sourceKey: string;
  payload: calendar_v3.Schema$Event;
  payloadHash: string;
};

export class GoogleCalendarReconnectRequiredError extends Error {}

function projectionEventId(connectionId: string, sourceKey: string, replaces?: string): string {
  return `sf${createHash("sha256").update(`${connectionId}:${sourceKey}:${replaces ?? "initial"}`).digest("hex")}`;
}

function payloadHash(payload: calendar_v3.Schema$Event): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isMissingGoogleResource(error: unknown): boolean {
  return error instanceof Error && /\b(404|410)\b|not found|resource has been deleted/i.test(error.message);
}

function isGoogleIdConflict(error: unknown): boolean {
  return error instanceof Error && /\b409\b|already exists|duplicate/i.test(error.message);
}

function toProjection(
  event: CalendarEventRow,
  connectionId: string,
  sourceKey: string,
  startsAt = event.starts_at,
  endsAt = event.ends_at,
): Projection {
  const payload: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: event.all_day
      ? { date: instantToDateOnly(startsAt) }
      : { dateTime: startsAt, timeZone: APPLICATION_TIME_ZONE },
    end: event.all_day
      ? { date: instantToDateOnly(endsAt) }
      : { dateTime: endsAt, timeZone: APPLICATION_TIME_ZONE },
    extendedProperties: {
      private: {
        studioflowConnection: connectionId,
        studioflowSourceKey: sourceKey,
      },
    },
  };
  return { sourceEventId: event.id, sourceKey, payload, payloadHash: payloadHash(payload) };
}

async function loadProjections(actor: GoogleCalendarActor, connectionId: string): Promise<Projection[]> {
  const today = instantToDateOnly(new Date().toISOString());
  const rangeStart = addCalendarDays(today, -90);
  const rangeEnd = addCalendarDays(today, 365);
  const rangeStartInstant = zonedWallTimeToIso(`${rangeStart}T00:00`);
  const rangeEndExclusive = zonedWallTimeToIso(`${addCalendarDays(rangeEnd, 1)}T00:00`);

  const { data, error } = await actor.supabase
    .from("calendar_events")
    .select("id, studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, meeting_mode, organizer_id, assignee_id, recurrence_rule, series_id, occurrence_start, cancelled_at, compensates_time_off_request_id, created_by, created_at, updated_at")
    .eq("studio_id", actor.membership.studio_id)
    .or(`and(series_id.is.null,cancelled_at.is.null,recurrence_rule.not.is.null),and(series_id.is.null,recurrence_rule.is.null,starts_at.lt.${rangeEndExclusive},ends_at.gt.${rangeStartInstant}),and(series_id.not.is.null,occurrence_start.gte.${rangeStartInstant},occurrence_start.lt.${rangeEndExclusive})`)
    .order("starts_at");
  if (error) throw new Error("Unable to load visible StudioFlow calendar events.", { cause: error });

  const events = data ?? [];
  const overrides = new Map(events
    .filter((event) => event.series_id && event.occurrence_start)
    .map((event) => [`${event.series_id}:${event.occurrence_start}`, event]));
  const projections: Projection[] = [];

  for (const event of events) {
    if (event.series_id || event.cancelled_at) continue;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (!rule) {
      projections.push(toProjection(event, connectionId, `calendar_event:${event.id}`));
      continue;
    }

    for (const occurrenceDate of recurrenceDates(instantToDateOnly(event.starts_at), rangeStart, rangeEnd, rule)) {
      const bounds = occurrenceBounds(event.starts_at, event.ends_at, event.all_day, occurrenceDate);
      const occurrenceStart = bounds.startsAt;
      const sourceKey = `calendar_event:${event.id}:${occurrenceStart}`;
      const override = overrides.get(`${event.id}:${occurrenceStart}`);
      if (override?.cancelled_at) continue;
      projections.push(override
        ? toProjection(override, connectionId, sourceKey)
        : toProjection(event, connectionId, sourceKey, bounds.startsAt, bounds.endsAt));
    }
  }

  return projections;
}

async function listProjectedGoogleEvents(calendar: calendar_v3.Calendar, calendarId: string, connectionId: string) {
  const bySourceKey = new Map<string, calendar_v3.Schema$Event>();
  let pageToken: string | undefined;
  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      pageToken,
      privateExtendedProperty: [`studioflowConnection=${connectionId}`],
      showDeleted: false,
      singleEvents: true,
    });
    for (const event of response.data.items ?? []) {
      const sourceKey = event.extendedProperties?.private?.studioflowSourceKey;
      if (sourceKey && event.id) bySourceKey.set(sourceKey, event);
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return bySourceKey;
}

async function insertProjection(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  projection: Projection,
  requestedId: string,
): Promise<string> {
  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: { ...projection.payload, id: requestedId },
      sendUpdates: "none",
    });
    if (!response.data.id) throw new Error("Google Calendar did not return an event ID.");
    return response.data.id;
  } catch (error) {
    if (!isGoogleIdConflict(error)) throw error;
    const existing = await calendar.events.get({ calendarId, eventId: requestedId });
    if (!existing.data.id) throw error;
    await calendar.events.update({ calendarId, eventId: requestedId, requestBody: projection.payload, sendUpdates: "none" });
    return requestedId;
  }
}

async function markReconnectRequired(connectionId: string) {
  await createAdminClient().from("google_calendar_connections").update({
    status: "reconnect_required",
    last_sync_error: "Google authorization is no longer valid. Reconnect the integration.",
  }).eq("id", connectionId);
}

export async function syncGoogleCalendar(actor: GoogleCalendarActor) {
  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("google_calendar_connections")
    .select("id, google_calendar_id, status")
    .eq("user_id", actor.user.id)
    .eq("studio_id", actor.membership.studio_id)
    .maybeSingle();
  if (connectionError) throw new Error("Unable to load Google Calendar connection.", { cause: connectionError });
  if (!connection || connection.status !== "active") throw new GoogleCalendarReconnectRequiredError("Google Calendar must be connected again.");

  const { data: credential, error: credentialError } = await admin
    .from("google_calendar_server_credentials")
    .select("encrypted_refresh_token")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (credentialError || !credential) {
    await markReconnectRequired(connection.id);
    throw new GoogleCalendarReconnectRequiredError("Stored Google authorization is unavailable.");
  }

  const oauth = createGoogleOAuthClient();
  oauth.setCredentials({ refresh_token: decryptRefreshToken(credential.encrypted_refresh_token) });
  const calendar = google.calendar({ version: "v3", auth: oauth });

  try {
    const [projections, mappingResult, googleBySourceKey] = await Promise.all([
      loadProjections(actor, connection.id),
      admin.from("google_calendar_event_mappings").select("id, connection_id, source_event_id, source_key, google_event_id, payload_hash, last_synced_at, created_at, updated_at").eq("connection_id", connection.id),
      listProjectedGoogleEvents(calendar, connection.google_calendar_id, connection.id),
    ]);
    if (mappingResult.error) throw new Error("Unable to load Google Calendar mappings.", { cause: mappingResult.error });

    const mappings = mappingResult.data ?? [];
    const mappingsBySource = new Map(mappings.map((mapping) => [mapping.source_key, mapping]));
    const currentKeys = new Set(projections.map((projection) => projection.sourceKey));
    let inserted = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    for (const projection of projections) {
      const mapping = mappingsBySource.get(projection.sourceKey);
      let discovered = googleBySourceKey.get(projection.sourceKey);
      if (!discovered && mapping) {
        try {
          const response = await calendar.events.get({
            calendarId: connection.google_calendar_id,
            eventId: mapping.google_event_id,
          });
          if (response.data.status !== "cancelled") discovered = response.data;
        } catch (error) {
          if (!isMissingGoogleResource(error)) throw error;
        }
      }
      let googleEventId = discovered?.id ?? mapping?.google_event_id;

      if (discovered?.id && mapping?.payload_hash === projection.payloadHash && mapping.google_event_id === discovered.id) {
        unchanged += 1;
        continue;
      }

      if (discovered?.id) {
        await calendar.events.update({ calendarId: connection.google_calendar_id, eventId: discovered.id, requestBody: projection.payload, sendUpdates: "none" });
        googleEventId = discovered.id;
        updated += 1;
      } else {
        const requestedId = mapping
          ? projectionEventId(connection.id, projection.sourceKey, mapping.google_event_id)
          : projectionEventId(connection.id, projection.sourceKey);
        googleEventId = await insertProjection(calendar, connection.google_calendar_id, projection, requestedId);
        inserted += 1;
      }

      const { error: upsertError } = await admin.from("google_calendar_event_mappings").upsert({
        connection_id: connection.id,
        source_event_id: projection.sourceEventId,
        source_key: projection.sourceKey,
        google_event_id: googleEventId,
        payload_hash: projection.payloadHash,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "connection_id,source_key" });
      if (upsertError) throw new Error("Unable to save Google Calendar mapping.", { cause: upsertError });
    }

    const staleSources = new Set([
      ...mappings.filter((mapping) => !currentKeys.has(mapping.source_key)).map((mapping) => mapping.source_key),
      ...[...googleBySourceKey.keys()].filter((sourceKey) => !currentKeys.has(sourceKey)),
    ]);
    for (const sourceKey of staleSources) {
      const mapping = mappingsBySource.get(sourceKey);
      const discovered = googleBySourceKey.get(sourceKey);
      const eventId = discovered?.id ?? mapping?.google_event_id;
      const locallyMapped = Boolean(mapping && mapping.google_event_id === eventId);
      const privatelyMarked = discovered?.extendedProperties?.private?.studioflowConnection === connection.id;
      if (eventId && (locallyMapped || privatelyMarked)) {
        try {
          await calendar.events.delete({ calendarId: connection.google_calendar_id, eventId, sendUpdates: "none" });
        } catch (error) {
          if (!isMissingGoogleResource(error)) throw error;
        }
      }
      const { error: deleteError } = await admin.from("google_calendar_event_mappings")
        .delete().eq("connection_id", connection.id).eq("source_key", sourceKey);
      if (deleteError) throw new Error("Unable to remove stale Google Calendar mapping.", { cause: deleteError });
      removed += 1;
    }

    const syncedAt = new Date().toISOString();
    const { error: updateError } = await admin.from("google_calendar_connections").update({
      last_sync_at: syncedAt,
      last_sync_error: null,
      status: "active",
    }).eq("id", connection.id);
    if (updateError) throw new Error("Unable to record Google Calendar sync completion.", { cause: updateError });
    return { inserted, updated, removed, unchanged, syncedAt };
  } catch (error) {
    if (isReconnectRequiredError(error)) {
      await markReconnectRequired(connection.id);
      throw new GoogleCalendarReconnectRequiredError("Google authorization was revoked or expired.");
    }
    await admin.from("google_calendar_connections").update({
      last_sync_error: "The latest manual sync failed. StudioFlow data was not changed.",
    }).eq("id", connection.id);
    throw error;
  }
}
