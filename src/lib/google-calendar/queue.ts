import "server-only";

import { after } from "next/server";
import { GoogleCalendarSyncError, googleCalendarJobLastError, logGoogleCalendarFailure } from "@/lib/google-calendar/diagnostics";
import { reconcileGoogleCalendarEvent } from "@/lib/google-calendar/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

type ReconciliationJob = Database["public"]["Tables"]["google_calendar_reconciliation_jobs"]["Row"];

const RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

async function completeJob(job: ReconciliationJob) {
  const { error } = await createAdminClient()
    .from("google_calendar_reconciliation_jobs")
    .delete()
    .eq("source_event_id", job.source_event_id)
    .eq("revision", job.revision)
    .eq("status", "processing");
  if (error) {
    throw new GoogleCalendarSyncError("job.complete", "db.delete.google_calendar_reconciliation_jobs", error, {
      rootEventId: job.source_event_id,
      studioId: job.studio_id,
    });
  }
}

async function retryOrFailJob(job: ReconciliationJob, failure: unknown) {
  const admin = createAdminClient();
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  const retryDelay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  const { error } = await admin
    .from("google_calendar_reconciliation_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      available_at: exhausted ? new Date().toISOString() : new Date(Date.now() + retryDelay).toISOString(),
      locked_at: null,
      last_error: googleCalendarJobLastError(failure, exhausted),
    })
    .eq("source_event_id", job.source_event_id)
    .eq("revision", job.revision)
    .eq("status", "processing");
  if (error) {
    throw new GoogleCalendarSyncError("job.retry", "db.update.google_calendar_reconciliation_jobs", error, {
      rootEventId: job.source_event_id,
      studioId: job.studio_id,
    });
  }
  return exhausted;
}

export async function processGoogleCalendarReconciliationQueue(limit = 10) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_google_calendar_reconciliation_jobs", { p_limit: limit });
  if (error) throw new GoogleCalendarSyncError("job.claim", "db.rpc.claim_google_calendar_reconciliation_jobs", error);

  const result = { claimed: data?.length ?? 0, completed: 0, retried: 0, failed: 0 };
  for (const job of data ?? []) {
    try {
      await reconcileGoogleCalendarEvent(job.studio_id, job.source_event_id);
      await completeJob(job);
      result.completed += 1;
    } catch (error) {
      logGoogleCalendarFailure(error, {
        rootEventId: job.source_event_id,
        studioId: job.studio_id,
      });
      if (await retryOrFailJob(job, error)) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}

/**
 * Low-latency worker wake-up. Durability comes from the transactional database
 * outbox and scheduled drain; this callback is intentionally only an accelerator.
 */
export function scheduleGoogleCalendarReconciliation() {
  after(async () => {
    try {
      await processGoogleCalendarReconciliationQueue(5);
    } catch (error) {
      // The durable job remains claimable by the scheduled drain. Never surface
      // Google or worker availability as a Calendar mutation failure.
      logGoogleCalendarFailure(error);
    }
  });
}
