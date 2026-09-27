import "server-only";

import { summarizeProjectCalendarTime, type ProjectCalendarEvent } from "@/lib/project-calendar-time";
import { createClient } from "@/lib/supabase/server";

export async function getProjectCalendarTime(projectId: string, studioId: string): Promise<{ count: number; minutes: number }> {
  const supabase = await createClient();
  const now = new Date();
  const events: ProjectCalendarEvent[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("calendar_events")
      .select("project_id, event_type, starts_at, ends_at, cancelled_at")
      .eq("studio_id", studioId)
      .eq("project_id", projectId)
      .in("event_type", ["site_visit", "business_trip"])
      .is("cancelled_at", null)
      .lte("ends_at", now.toISOString())
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    events.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return summarizeProjectCalendarTime(events, projectId, now);
}
