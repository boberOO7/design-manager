import "server-only";

import { createHash } from "node:crypto";
import { calendar_v3, google } from "googleapis";
import {
  addCalendarDays,
  APPLICATION_TIME_ZONE,
  instantToDateOnly,
  isCalendarEventRelevantToUser,
  zonedWallTimeToIso,
} from "@/lib/calendar";
import { occurrenceBounds, parseRecurrenceRule, recurrenceDates } from "@/lib/calendar-recurrence";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import { atGoogleCalendarStage, GoogleCalendarSyncError, logGoogleCalendarFailure } from "@/lib/google-calendar/diagnostics";
import { createGoogleOAuthClient, isReconnectRequiredError } from "@/lib/google-calendar/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { getGoogleCalendarActor } from "@/lib/google-calendar/auth";
import type { Database } from "@/types/database.types";

type GoogleCalendarActor = NonNullable<Awaited<ReturnType<typeof getGoogleCalendarActor>>>;
type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];
type CalendarInviteRow = Database["public"]["Tables"]["calendar_event_invites"]["Row"];
type CalendarParticipantRow = Database["public"]["Tables"]["calendar_event_participants"]["Row"];
type GoogleConnection = Pick<
  Database["public"]["Tables"]["google_calendar_connections"]["Row"],
  "google_calendar_id" | "id" | "status" | "studio_id" | "user_id"
>;
type GoogleMapping = Database["public"]["Tables"]["google_calendar_event_mappings"]["Row"];
type SyncEventRow = CalendarEventRow & {
  invitees: Pick<CalendarInviteRow, "user_id">[];
  participants: Pick<CalendarParticipantRow, "user_id">[];
};
type Projection = {
  rootSourceEventId: string;
  sourceEventId: string;
  sourceKey: string;
  payload: calendar_v3.Schema$Event;
  payloadHash: string;
};
type ReconcileCounts = { inserted: number; updated: number; removed: number; unchanged: number };

const EVENT_SELECT = "id, studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, meeting_mode, organizer_id, assignee_id, recurrence_rule, series_id, occurrence_start, cancelled_at, compensates_time_off_request_id, created_by, created_at, updated_at, invitees:calendar_event_invites(user_id), participants:calendar_event_participants(user_id)";

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

function sourceKeyBelongsToRoot(sourceKey: string, rootEventId: string): boolean {
  const rootKey = `calendar_event:${rootEventId}`;
  return sourceKey === rootKey || sourceKey.startsWith(`${rootKey}:`);
}

function isRelevant(event: SyncEventRow, userId: string): boolean {
  return isCalendarEventRelevantToUser({
    eventType: event.event_type,
    organizerId: event.organizer_id,
    assigneeId: event.assignee_id,
    inviteeIds: event.invitees.map((invitee) => invitee.user_id),
    participantIds: event.participants.map((participant) => participant.user_id),
  }, userId);
}

function toProjection(
  event: SyncEventRow,
  connectionId: string,
  rootSourceEventId: string,
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
        studioflowRootEvent: rootSourceEventId,
        studioflowSourceKey: sourceKey,
      },
    },
  };
  return {
    rootSourceEventId,
    sourceEventId: event.id,
    sourceKey,
    payload,
    payloadHash: payloadHash(payload),
  };
}

function projectionHorizon() {
  const today = instantToDateOnly(new Date().toISOString());
  const rangeStart = addCalendarDays(today, -90);
  const rangeEnd = addCalendarDays(today, 365);
  return {
    rangeStart,
    rangeEnd,
    rangeStartInstant: zonedWallTimeToIso(`${rangeStart}T00:00`),
    rangeEndExclusive: zonedWallTimeToIso(`${addCalendarDays(rangeEnd, 1)}T00:00`),
  };
}

async function loadProjectionEvents(studioId: string, rootEventId?: string): Promise<SyncEventRow[]> {
  const admin = createAdminClient();
  const query = admin.from("calendar_events").select(EVENT_SELECT).eq("studio_id", studioId);
  const horizon = projectionHorizon();
  const result = rootEventId
    ? await query.or(`id.eq.${rootEventId},series_id.eq.${rootEventId}`).order("starts_at")
      .overrideTypes<SyncEventRow[], { merge: false }>()
    : await query.or(`and(series_id.is.null,cancelled_at.is.null,recurrence_rule.not.is.null),and(series_id.is.null,recurrence_rule.is.null,starts_at.lt.${horizon.rangeEndExclusive},ends_at.gt.${horizon.rangeStartInstant}),and(series_id.not.is.null,occurrence_start.gte.${horizon.rangeStartInstant},occurrence_start.lt.${horizon.rangeEndExclusive})`)
      .order("starts_at")
      .overrideTypes<SyncEventRow[], { merge: false }>();
  if (result.error) {
    throw new GoogleCalendarSyncError("projection.load", "db.select.calendar_events", result.error, {
      rootEventId,
      studioId,
    });
  }
  return result.data ?? [];
}

function buildProjections(events: SyncEventRow[], connectionId: string, userId: string): Projection[] {
  const horizon = projectionHorizon();
  const overrides = new Map(events
    .filter((event) => event.series_id && event.occurrence_start)
    .map((event) => [`${event.series_id}:${event.occurrence_start}`, event]));
  const projections: Projection[] = [];

  for (const event of events) {
    if (event.series_id || event.cancelled_at) continue;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (!rule) {
      const overlapsHorizon = event.starts_at < horizon.rangeEndExclusive && event.ends_at > horizon.rangeStartInstant;
      if (overlapsHorizon && isRelevant(event, userId)) {
        projections.push(toProjection(event, connectionId, event.id, `calendar_event:${event.id}`));
      }
      continue;
    }

    for (const occurrenceDate of recurrenceDates(instantToDateOnly(event.starts_at), horizon.rangeStart, horizon.rangeEnd, rule)) {
      const bounds = occurrenceBounds(event.starts_at, event.ends_at, event.all_day, occurrenceDate);
      const occurrenceStart = bounds.startsAt;
      const sourceKey = `calendar_event:${event.id}:${occurrenceStart}`;
      const override = overrides.get(`${event.id}:${occurrenceStart}`);
      const occurrence = override ?? event;
      if (occurrence.cancelled_at || !isRelevant(occurrence, userId)) continue;
      projections.push(override
        ? toProjection(override, connectionId, event.id, sourceKey)
        : toProjection(event, connectionId, event.id, sourceKey, bounds.startsAt, bounds.endsAt));
    }
  }

  return projections;
}

async function listProjectedGoogleEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  connectionId: string,
  rootEventId?: string,
) {
  const bySourceKey = new Map<string, calendar_v3.Schema$Event>();
  let pageToken: string | undefined;
  do {
    const response = await atGoogleCalendarStage(
      "google_projection.list",
      "google.events.list",
      { connectionId, rootEventId },
      () => calendar.events.list({
        calendarId,
        maxResults: 2500,
        pageToken,
        privateExtendedProperty: [`studioflowConnection=${connectionId}`],
        showDeleted: false,
        singleEvents: true,
      }),
    );
    for (const event of response.data.items ?? []) {
      const sourceKey = event.extendedProperties?.private?.studioflowSourceKey;
      if (sourceKey && event.id && (!rootEventId || sourceKeyBelongsToRoot(sourceKey, rootEventId))) {
        bySourceKey.set(sourceKey, event);
      }
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
  connectionId: string,
): Promise<string> {
  try {
    const response = await atGoogleCalendarStage(
      "google_projection.insert",
      "google.events.insert",
      { connectionId, rootEventId: projection.rootSourceEventId, sourceEventId: projection.sourceEventId },
      () => calendar.events.insert({
        calendarId,
        requestBody: { ...projection.payload, id: requestedId },
        sendUpdates: "none",
      }),
    );
    if (!response.data.id) {
      throw new GoogleCalendarSyncError(
        "google_projection.insert",
        "google.events.insert.response",
        new Error("Google Calendar did not return an event ID."),
        { connectionId, rootEventId: projection.rootSourceEventId, sourceEventId: projection.sourceEventId },
      );
    }
    return response.data.id;
  } catch (error) {
    if (!isGoogleIdConflict(error)) throw error;
    const existing = await atGoogleCalendarStage(
      "google_projection.insert_conflict",
      "google.events.get",
      { connectionId, rootEventId: projection.rootSourceEventId, sourceEventId: projection.sourceEventId },
      () => calendar.events.get({ calendarId, eventId: requestedId }),
    );
    if (!existing.data.id) throw error;
    await atGoogleCalendarStage(
      "google_projection.insert_conflict",
      "google.events.update",
      { connectionId, rootEventId: projection.rootSourceEventId, sourceEventId: projection.sourceEventId },
      () => calendar.events.update({ calendarId, eventId: requestedId, requestBody: projection.payload, sendUpdates: "none" }),
    );
    return requestedId;
  }
}

async function markReconnectRequired(connectionId: string) {
  const { error } = await createAdminClient().from("google_calendar_connections").update({
    status: "reconnect_required",
    last_sync_error: "Google authorization is no longer valid. Reconnect the integration.",
  }).eq("id", connectionId);
  if (error) {
    throw new GoogleCalendarSyncError("connection.reconnect", "db.update.google_calendar_connections", error, {
      connectionId,
    });
  }
}

async function getGoogleClient(connection: GoogleConnection) {
  const admin = createAdminClient();
  const { data: credential, error } = await admin
    .from("google_calendar_server_credentials")
    .select("encrypted_refresh_token")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (error) {
    throw new GoogleCalendarSyncError("credentials.load", "db.select.google_calendar_server_credentials", error, {
      connectionId: connection.id,
      studioId: connection.studio_id,
      userId: connection.user_id,
    });
  }
  if (!credential) {
    throw new GoogleCalendarReconnectRequiredError("Stored Google authorization is unavailable.");
  }
  const oauth = createGoogleOAuthClient();
  const refreshToken = await atGoogleCalendarStage(
    "credentials.decrypt",
    "decrypt_refresh_token",
    { connectionId: connection.id, studioId: connection.studio_id, userId: connection.user_id },
    async () => decryptRefreshToken(credential.encrypted_refresh_token),
  );
  oauth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth });
}

async function reconcileConnection(
  connection: GoogleConnection,
  projections: Projection[],
  rootEventId?: string,
): Promise<ReconcileCounts> {
  const admin = createAdminClient();
  const calendar = await getGoogleClient(connection);
  const mappingQuery = admin
    .from("google_calendar_event_mappings")
    .select("id, connection_id, source_event_id, root_source_event_id, source_key, google_event_id, payload_hash, last_synced_at, created_at, updated_at")
    .eq("connection_id", connection.id);
  const [mappingResult, googleBySourceKey] = await Promise.all([
    rootEventId ? mappingQuery.eq("root_source_event_id", rootEventId) : mappingQuery,
    listProjectedGoogleEvents(calendar, connection.google_calendar_id, connection.id, rootEventId),
  ]);
  if (mappingResult.error) {
    throw new GoogleCalendarSyncError("mapping.load", "db.select.google_calendar_event_mappings", mappingResult.error, {
      connectionId: connection.id,
      rootEventId,
      studioId: connection.studio_id,
      userId: connection.user_id,
    });
  }

  const mappings: GoogleMapping[] = mappingResult.data ?? [];
  const mappingsBySource = new Map(mappings.map((mapping) => [mapping.source_key, mapping]));
  const currentKeys = new Set(projections.map((projection) => projection.sourceKey));
  const counts: ReconcileCounts = { inserted: 0, updated: 0, removed: 0, unchanged: 0 };

  for (const projection of projections) {
    const mapping = mappingsBySource.get(projection.sourceKey);
    let discovered = googleBySourceKey.get(projection.sourceKey);
    if (!discovered && mapping) {
      try {
        const response = await atGoogleCalendarStage(
          "google_projection.lookup",
          "google.events.get",
          {
            connectionId: connection.id,
            rootEventId: projection.rootSourceEventId,
            sourceEventId: projection.sourceEventId,
            studioId: connection.studio_id,
            userId: connection.user_id,
          },
          () => calendar.events.get({
            calendarId: connection.google_calendar_id,
            eventId: mapping.google_event_id,
          }),
        );
        if (response.data.status !== "cancelled") discovered = response.data;
      } catch (error) {
        if (!isMissingGoogleResource(error)) throw error;
      }
    }
    let googleEventId = discovered?.id ?? mapping?.google_event_id;

    if (discovered?.id && mapping?.payload_hash === projection.payloadHash && mapping.google_event_id === discovered.id) {
      counts.unchanged += 1;
      continue;
    }

    if (discovered?.id) {
      const discoveredId = discovered.id;
      await atGoogleCalendarStage(
        "google_projection.update",
        "google.events.update",
        {
          connectionId: connection.id,
          rootEventId: projection.rootSourceEventId,
          sourceEventId: projection.sourceEventId,
          studioId: connection.studio_id,
          userId: connection.user_id,
        },
        () => calendar.events.update({
          calendarId: connection.google_calendar_id,
          eventId: discoveredId,
          requestBody: projection.payload,
          sendUpdates: "none",
        }),
      );
      googleEventId = discoveredId;
      counts.updated += 1;
    } else {
      const requestedId = mapping
        ? projectionEventId(connection.id, projection.sourceKey, mapping.google_event_id)
        : projectionEventId(connection.id, projection.sourceKey);
      googleEventId = await insertProjection(calendar, connection.google_calendar_id, projection, requestedId, connection.id);
      counts.inserted += 1;
    }

    const { error: upsertError } = await admin.from("google_calendar_event_mappings").upsert({
      connection_id: connection.id,
      source_event_id: projection.sourceEventId,
      root_source_event_id: projection.rootSourceEventId,
      source_key: projection.sourceKey,
      google_event_id: googleEventId,
      payload_hash: projection.payloadHash,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "connection_id,source_key" });
    if (upsertError) {
      throw new GoogleCalendarSyncError("mapping.save", "db.upsert.google_calendar_event_mappings", upsertError, {
        connectionId: connection.id,
        rootEventId: projection.rootSourceEventId,
        sourceEventId: projection.sourceEventId,
        studioId: connection.studio_id,
        userId: connection.user_id,
      });
    }
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
        await atGoogleCalendarStage(
          "google_projection.delete",
          "google.events.delete",
          { connectionId: connection.id, rootEventId, studioId: connection.studio_id, userId: connection.user_id },
          () => calendar.events.delete({ calendarId: connection.google_calendar_id, eventId, sendUpdates: "none" }),
        );
      } catch (error) {
        if (!isMissingGoogleResource(error)) throw error;
      }
    }
    const { error: deleteError } = await admin.from("google_calendar_event_mappings")
      .delete().eq("connection_id", connection.id).eq("source_key", sourceKey);
    if (deleteError) {
      throw new GoogleCalendarSyncError("mapping.delete", "db.delete.google_calendar_event_mappings", deleteError, {
        connectionId: connection.id,
        rootEventId,
        studioId: connection.studio_id,
        userId: connection.user_id,
      });
    }
    counts.removed += 1;
  }

  return counts;
}

async function recordConnectionSuccess(connectionId: string) {
  const syncedAt = new Date().toISOString();
  const { error } = await createAdminClient().from("google_calendar_connections").update({
    last_sync_at: syncedAt,
    last_sync_error: null,
    status: "active",
  }).eq("id", connectionId);
  if (error) {
    throw new GoogleCalendarSyncError("connection.complete", "db.update.google_calendar_connections", error, {
      connectionId,
    });
  }
  return syncedAt;
}

function addCounts(total: ReconcileCounts, next: ReconcileCounts) {
  total.inserted += next.inserted;
  total.updated += next.updated;
  total.removed += next.removed;
  total.unchanged += next.unchanged;
}

export async function syncGoogleCalendar(actor: GoogleCalendarActor) {
  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("google_calendar_connections")
    .select("id, user_id, studio_id, google_calendar_id, status")
    .eq("user_id", actor.user.id)
    .eq("studio_id", actor.membership.studio_id)
    .maybeSingle();
  if (connectionError) {
    throw new GoogleCalendarSyncError("connection.load", "db.select.google_calendar_connections", connectionError, {
      studioId: actor.membership.studio_id,
      userId: actor.user.id,
    });
  }
  if (!connection || connection.status !== "active") {
    throw new GoogleCalendarReconnectRequiredError("Google Calendar must be connected again.");
  }

  try {
    const events = await loadProjectionEvents(actor.membership.studio_id);
    const projections = await atGoogleCalendarStage(
      "projection.build",
      "build_relevant_occurrences",
      { connectionId: connection.id, studioId: connection.studio_id, userId: connection.user_id },
      async () => buildProjections(events, connection.id, actor.user.id),
    );
    const counts = await reconcileConnection(connection, projections);
    const syncedAt = await recordConnectionSuccess(connection.id);
    return { ...counts, syncedAt };
  } catch (error) {
    if (error instanceof GoogleCalendarReconnectRequiredError || isReconnectRequiredError(error)) {
      logGoogleCalendarFailure(error, {
        connectionId: connection.id,
        studioId: connection.studio_id,
        userId: connection.user_id,
      });
      await markReconnectRequired(connection.id);
      throw new GoogleCalendarReconnectRequiredError("Google authorization was revoked or expired.");
    }
    const { error: recordError } = await admin.from("google_calendar_connections").update({
      last_sync_error: "The latest manual sync failed. StudioFlow data was not changed.",
    }).eq("id", connection.id);
    if (recordError) {
      logGoogleCalendarFailure(new GoogleCalendarSyncError(
        "connection.failure",
        "db.update.google_calendar_connections",
        recordError,
        { connectionId: connection.id, studioId: connection.studio_id, userId: connection.user_id },
      ));
    }
    throw error;
  }
}

/** Reconciles one root event across every connected user in its studio. */
export async function reconcileGoogleCalendarEvent(studioId: string, rootEventId: string) {
  const admin = createAdminClient();
  const [events, connectionsResult, membershipsResult] = await Promise.all([
    loadProjectionEvents(studioId, rootEventId),
    admin.from("google_calendar_connections")
      .select("id, user_id, studio_id, google_calendar_id, status")
      .eq("studio_id", studioId)
      .eq("status", "active"),
    admin.from("studio_members").select("user_id").eq("studio_id", studioId).eq("is_active", true),
  ]);
  if (connectionsResult.error) {
    throw new GoogleCalendarSyncError("connections.load", "db.select.google_calendar_connections", connectionsResult.error, {
      rootEventId,
      studioId,
    });
  }
  if (membershipsResult.error) {
    throw new GoogleCalendarSyncError("relevance.users", "db.select.studio_members", membershipsResult.error, {
      rootEventId,
      studioId,
    });
  }

  const activeMemberIds = new Set((membershipsResult.data ?? []).map((membership) => membership.user_id));
  const counts: ReconcileCounts = { inserted: 0, updated: 0, removed: 0, unchanged: 0 };
  for (const connection of connectionsResult.data ?? []) {
    const projections = await atGoogleCalendarStage(
      "projection.build",
      "build_relevant_occurrences",
      {
        connectionId: connection.id,
        rootEventId,
        studioId: connection.studio_id,
        userId: connection.user_id,
      },
      async () => activeMemberIds.has(connection.user_id)
        ? buildProjections(events, connection.id, connection.user_id)
        : [],
    );
    try {
      addCounts(counts, await reconcileConnection(connection, projections, rootEventId));
      await recordConnectionSuccess(connection.id);
    } catch (error) {
      if (error instanceof GoogleCalendarReconnectRequiredError || isReconnectRequiredError(error)) {
        logGoogleCalendarFailure(error, {
          connectionId: connection.id,
          rootEventId,
          studioId: connection.studio_id,
          userId: connection.user_id,
        });
        await markReconnectRequired(connection.id);
        continue;
      }
      const { error: recordError } = await admin.from("google_calendar_connections").update({
        last_sync_error: "Automatic Google Calendar reconciliation will retry. StudioFlow data was not changed.",
      }).eq("id", connection.id);
      if (recordError) {
        logGoogleCalendarFailure(new GoogleCalendarSyncError(
          "connection.failure",
          "db.update.google_calendar_connections",
          recordError,
          {
            connectionId: connection.id,
            rootEventId,
            studioId: connection.studio_id,
            userId: connection.user_id,
          },
        ));
      }
      throw error;
    }
  }
  return counts;
}
