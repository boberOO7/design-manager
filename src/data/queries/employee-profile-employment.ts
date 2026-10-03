import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { instantToDateOnly } from "@/lib/calendar";
import { getDayOffCompensation } from "@/lib/time-off-compensation";
import { createClient } from "@/lib/supabase/server";

export async function getEmployeeProfileEmployment(userId: string, now = new Date()) {
  const admin = await getActiveStudioAdmin();
  if (!admin) throw new Error("Studio administrator access required.");
  const supabase = await createClient();
  const asOf = instantToDateOnly(now.toISOString());
  const page = (offset: number) => supabase.from("time_off_requests")
    .select("id, request_type, start_date, end_date, start_time, end_time, all_day", { count: "exact" })
    .eq("studio_id", admin.studio_id).eq("user_id", userId).eq("status", "approved")
    .lte("start_date", asOf).order("start_date", { ascending: false }).order("id").range(offset, offset + 999);
  const [first, balance] = await Promise.all([
    page(0),
    supabase.rpc("get_vacation_balance", { p_studio_id: admin.studio_id, p_user_id: userId, p_as_of: asOf }),
  ]);
  if (first.error || !first.data || first.count === null || balance.error) {
    throw new Error("Unable to load employee employment summary.", { cause: first.error ?? balance.error });
  }
  const requests = [...first.data];
  while (requests.length < first.count) {
    const next = await page(requests.length);
    if (next.error || !next.data?.length) throw new Error("Unable to load employee absences.", { cause: next.error });
    requests.push(...next.data);
  }
  const dayOffs = requests.filter((request) => request.request_type === "day_off");
  let makeupMinutes = 0;
  // Reuse Calendar's compensation arithmetic. It includes scheduled events,
  // so this must never be presented as verified completed work or days worked.
  for (let offset = 0; offset < dayOffs.length; offset += 100) {
    const batch = dayOffs.slice(offset, offset + 100);
    const eventPage = (eventOffset: number) => supabase.from("calendar_events")
      .select("id, starts_at, ends_at, all_day, cancelled_at, compensates_time_off_request_id", { count: "exact" })
      .eq("studio_id", admin.studio_id).eq("event_type", "work_makeup")
      .in("compensates_time_off_request_id", batch.map((request) => request.id))
      .order("id").range(eventOffset, eventOffset + 999);
    const firstEvents = await eventPage(0);
    if (firstEvents.error || !firstEvents.data || firstEvents.count === null) throw new Error("Unable to load employee work makeup.", { cause: firstEvents.error });
    const events = [...firstEvents.data];
    while (events.length < firstEvents.count) {
      const next = await eventPage(events.length);
      if (next.error || !next.data?.length) throw new Error("Unable to load employee work makeup.", { cause: next.error });
      events.push(...next.data);
    }
    const contributions = events.map((event) => ({ id: event.id, startsAt: event.starts_at, endsAt: event.ends_at, allDay: event.all_day, cancelledAt: event.cancelled_at, compensatesTimeOffRequestId: event.compensates_time_off_request_id }));
    makeupMinutes += batch.reduce((total, request) => total + getDayOffCompensation({ id: request.id, startDate: request.start_date, endDate: request.end_date, startTime: request.start_time, endTime: request.end_time, allDay: request.all_day }, contributions).compensatedMinutes, 0);
  }
  return {
    asOf, absenceRequests: requests.length, makeupMinutes, availableVacationDays: balance.data,
    // Preserve approved periods; the domain has no authoritative used-day total.
    vacationPeriods: requests.filter((request) => request.request_type === "vacation").slice(0, 2)
      .map((request) => ({ id: request.id, startDate: request.start_date, endDate: request.end_date })),
  };
}
