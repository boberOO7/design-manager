import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getUpcomingEndDate, sortUpcomingAbsences, type AdministrationRequest } from "@/lib/administration";
import { instantToDateOnly } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

export type DashboardAbsence = Pick<AdministrationRequest, "id" | "employeeName" | "startDate" | "endDate" | "startTime" | "endTime" | "allDay">;

export async function getDashboardAdministration(): Promise<{ pendingCount: number; upcomingAbsences: DashboardAbsence[] } | null> {
  const membership = await getActiveStudioAdmin();
  if (!membership) return null;
  const supabase = await createClient();
  const today = instantToDateOnly(new Date().toISOString());
  const [pending, upcoming] = await Promise.all([
    // Count all visible requests; keep the employee visibility join.
    supabase.from("time_off_requests").select("id, employee:profiles!time_off_requests_user_id_fkey!inner()", { count: "exact", head: true })
      .eq("studio_id", membership.studio_id).eq("status", "pending"),
    supabase.from("time_off_requests").select("id, start_date, end_date, start_time, end_time, all_day, employee:profiles!time_off_requests_user_id_fkey!inner(full_name)")
      .eq("studio_id", membership.studio_id).eq("status", "approved").is("cancelled_at", null)
      .lte("start_date", getUpcomingEndDate(today)).gte("end_date", today).order("start_date").limit(50),
  ]);
  if (pending.error || upcoming.error) throw new Error("Unable to load Dashboard administration summary.", { cause: pending.error ?? upcoming.error });
  // Sort the same capped population before taking the three displayed absences.
  return { pendingCount: pending.count ?? 0, upcomingAbsences: sortUpcomingAbsences(upcoming.data.map((row) => ({
    id: row.id, employeeName: row.employee.full_name, startDate: row.start_date, endDate: row.end_date,
    startTime: row.start_time, endTime: row.end_time, allDay: row.all_day,
  }))).slice(0, 3) };
}
