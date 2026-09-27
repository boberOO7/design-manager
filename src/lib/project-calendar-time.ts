import type { Database } from "@/types/database.types";

export type ProjectCalendarEvent = Pick<Database["public"]["Tables"]["calendar_events"]["Row"], "project_id" | "event_type" | "starts_at" | "ends_at" | "cancelled_at">;

export function summarizeProjectCalendarTime(events: ProjectCalendarEvent[], projectId: string, now: Date): { count: number; minutes: number } {
  const nowMs = now.getTime();
  let count = 0;
  let durationMs = 0;

  for (const event of events) {
    if (event.project_id !== projectId || event.cancelled_at || (event.event_type !== "site_visit" && event.event_type !== "business_trip")) continue;
    const startMs = Date.parse(event.starts_at);
    const endMs = Date.parse(event.ends_at);
    if (endMs > nowMs || endMs <= startMs) continue;
    count++;
    durationMs += endMs - startMs;
  }

  return { count, minutes: Math.round(durationMs / 60_000) };
}
