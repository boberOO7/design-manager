import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCanonicalProductivityAttributions } from "@/data/queries/productivity-attributions";
import { createClient } from "@/lib/supabase/server";
import { buildStatistics, type StatisticsPeriod } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";
import { buildCrmStatistics } from "@/lib/statistics-crm";
import { buildAttendanceStatistics } from "@/lib/statistics-attendance";
import { buildCalendarStatistics, calendarStatisticsAssignments } from "@/lib/statistics-calendar";

/** Page each independent source, with stable ordering, past PostgREST's 1,000
 * row cap. No per-project/person queries and no Finance occurrence writes.
 */
export async function readStatisticsPages<T>(page: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await page(offset);
    if (result.error || !result.data) throw new Error("Unable to load Statistics.", { cause: result.error });
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}

export async function getStatistics(period: StatisticsPeriod, today = getKyivDateOnly(), now = new Date().toISOString()) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const studio = admin.studio_id;
  const [projects, tasks, activities, attributions, payroll, unknownCosts, payCoverage, leads, timeOff, events, members, leadHistory, invites, participants] = await Promise.all([
    readStatisticsPages(offset => client.from("projects").select("id,name,status,archived_at,completed_at,include_in_productivity,total_area_m2")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("tasks").select("id,project_id,completed_at,project:projects!inner(studio_id)").eq("project.studio_id", studio)
      .eq("status", "completed").order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("project_activity").select("project_id,changes,created_at").eq("studio_id", studio)
      .eq("entity_type", "project").order("created_at").order("id").range(offset, offset + 999)),
    getCanonicalProductivityAttributions(studio),
    readStatisticsPages(offset => client.from("finance_obligations").select("id,schedule_id,period_start,period_end,terms:finance_schedule_terms!finance_obligations_studio_id_terms_id_schedule_id_fkey(currency,employee_deductions,employer_cost,employer_cost_status),items:finance_obligation_items!finance_obligation_items_studio_id_obligation_id_fkey(component,managed_active,expected:finance_expected_items!finance_obligation_items_studio_id_expected_item_id_fkey(amount::text,currency,certainty,commitment))")
      .eq("studio_id", studio).eq("kind", "payroll").lt("period_end", `${today.slice(0, 7)}-01`).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("finance_payroll_unknown_costs").select("obligation_id,component,status,amount::text")
      .eq("studio_id", studio).order("obligation_id").order("component").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("finance_schedule_history").select("schedule_id,effective_from,valid_through,schedule:finance_schedules!inner(kind)")
      .eq("studio_id", studio).eq("schedule.kind", "payroll").order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("crm_leads").select("id,created_at,first_contact_date,status,invalid_reason,project_id,source")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("time_off_requests").select("id,user_id,request_type,start_date,end_date,start_time,end_time,all_day,status")
      .eq("studio_id", studio).eq("status", "approved").order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("calendar_events").select("id,event_type,starts_at,ends_at,all_day,project_id,organizer_id,assignee_id,cancelled_at,recurrence_rule,series_id,occurrence_start,compensates_time_off_request_id")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("studio_members").select("user_id,is_active,profile:profiles!studio_members_user_id_fkey(id,full_name,is_active)")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("crm_lead_history").select("id,lead_id,event_type,actor_id,previous_status,new_status,created_at")
      .eq("studio_id", studio).order("created_at").order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("calendar_event_invites").select("event_id,user_id,status,event:calendar_events!inner(studio_id)")
      .eq("event.studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("calendar_event_participants").select("event_id,user_id,event:calendar_events!inner(studio_id)")
      .eq("event.studio_id", studio).order("event_id").order("user_id").range(offset, offset + 999)),
  ]);
  // Only report aggregates and the admin attendance row identities are returned.
  // Individual salaries, HR explanations and CRM contact details are not payloads.
  const sources = { projects, tasks, activities, attributions, payroll, unknownCosts, payCoverage };
  let overview = buildStatistics(sources, period, today);
  if (period === "all") {
    const firstDate = [overview.from, ...leads.map(row => getKyivDateOnly(new Date(row.created_at))),
      ...timeOff.map(row => row.start_date), ...events.map(row => getKyivDateOnly(new Date(row.starts_at)))]
      .filter(date => date <= today).sort()[0];
    overview = buildStatistics(sources, period, today, `${firstDate.slice(0, 7)}-01`);
  }
  const range = { from: overview.from, through: overview.through };
  const people = members.map(row => ({ id: row.user_id, name: row.profile?.full_name ?? "", active: row.is_active && !!row.profile?.is_active }));
  return { ...overview,
    leads: buildCrmStatistics(leads, activities, range, today, tasks, leadHistory),
    attendance: buildAttendanceStatistics(timeOff, events, people, range, now),
    calendar: buildCalendarStatistics(events, projects, range, now, { members: people, assignments: calendarStatisticsAssignments(events, invites, participants) }),
  };
}

export type StatisticsPageReport = NonNullable<Awaited<ReturnType<typeof getStatistics>>>;
