import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCanonicalProductivityAttributions } from "@/data/queries/productivity-attributions";
import { createClient } from "@/lib/supabase/server";
import { buildStatistics, type StatisticsPeriod } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";
import { buildCrmStatistics } from "@/lib/statistics-crm";
import { buildAttendanceStatistics } from "@/lib/statistics-attendance";
import { buildCalendarStatistics, calendarStatisticsAssignments } from "@/lib/statistics-calendar";
import { buildWorkStatistics, completedReviewCredits, completedReviewSessions } from "@/lib/work-log";

/** Page each independent source, with stable ordering, past PostgREST's 1,000
 * row cap. No per-project/person queries.
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
  const [projects, tasks, activities, attributions, leads, timeOff, events, members, leadHistory, invites, participants, workLog, reviewRounds, reviewSessions] = await Promise.all([
    readStatisticsPages(offset => client.from("projects").select("id,name,status,archived_at,started_at,completed_at,include_in_productivity,total_area_m2")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("tasks").select("id,project_id,completed_at,project:projects!inner(studio_id)").eq("project.studio_id", studio)
      .eq("status", "completed").order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("project_activity").select("project_id,changes,created_at").eq("studio_id", studio)
      .eq("entity_type", "project").order("created_at").order("id").range(offset, offset + 999)),
    getCanonicalProductivityAttributions(studio),
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
    readStatisticsPages(offset => client.from("work_log_entries").select("id,user_id,work_date,internal_activity_type,activity_kind,task_id,review_round_id,minutes,task:tasks!work_log_entries_task_id_fkey(project_id)")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("task_review_rounds")
      .select("id,reviewer_id,completed_at,result,reviewers:task_review_round_reviewers(reviewer_id,approved_at),project:projects!inner(studio_id)")
      .eq("project.studio_id", studio).order("id").range(offset, offset + 999)),
    readStatisticsPages(offset => client.from("review_timer_sessions")
      .select("id,work_session_id,user_id,state,elapsed_us,members:review_timer_members(round_id,finished_at)")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
  ]);
  // Only report aggregates and the admin attendance row identities are returned.
  // HR explanations and CRM contact details are not payloads.
  const sources = { projects, tasks, activities, attributions };
  let overview = buildStatistics(sources, period, today);
  if (period === "all") {
    const firstDate = [overview.from, ...leads.map(row => getKyivDateOnly(new Date(row.created_at))),
      ...timeOff.map(row => row.start_date), ...events.map(row => getKyivDateOnly(new Date(row.starts_at))),
      ...workLog.map(row => row.work_date), ...completedReviewCredits(reviewRounds).map(row => getKyivDateOnly(new Date(row.completedAt))),
      ...completedReviewSessions(reviewSessions).map(row => getKyivDateOnly(new Date(row.completedAt)))]
      .filter(date => date <= today).sort()[0];
    overview = buildStatistics(sources, period, today, `${firstDate.slice(0, 7)}-01`);
  }
  const range = { from: overview.from, through: overview.through };
  const people = members.map(row => ({ id: row.user_id, name: row.profile?.full_name ?? "", active: row.is_active && !!row.profile?.is_active }));
  const calendar = buildCalendarStatistics(events, projects, range, now, { members: people, assignments: calendarStatisticsAssignments(events, invites, participants) });
  return { ...overview,
    work: buildWorkStatistics(workLog.map(row => ({ ...row, project_id: row.task?.project_id ?? null })), reviewRounds, people, range, projects, reviewSessions),
    leads: buildCrmStatistics(leads, activities, range, today, tasks, leadHistory),
    attendance: buildAttendanceStatistics(timeOff, events, people, range, now),
    calendar,
  };
}

export type StatisticsPageReport = NonNullable<Awaited<ReturnType<typeof getStatistics>>>;
