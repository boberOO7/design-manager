import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { loadAllRows } from "./all-rows";
import { getStatisticsWorkday } from "./statistics-workday";
import { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";
import { instantToDateOnly, zonedWallTimeToIso } from "@/lib/calendar";
import { activityMonthBounds, buildTeamActivity, teamActivityMonthSchema } from "@/lib/team-activity";

export async function getTeamActivity(month: string, today = getKyivDateOnly()) {
  teamActivityMonthSchema.parse(month);
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const studio = admin.studio_id;
  const { from, until } = activityMonthBounds(month);
  const [entries, submissions, people, timers, workdayMinutes, timeOff, daysOff, events] = await Promise.all([
    loadAllRows((first, last) => client.from("work_log_entries")
      .select("id,user_id,work_date,activity_kind,internal_activity_type,minutes,review_round_id,task:tasks!work_log_entries_task_id_fkey(id,title,project_id,project:projects!tasks_project_id_fkey(id,name))")
      .eq("studio_id", studio).gte("work_date", from).lt("work_date", until).order("id").range(first, last)),
    loadAllRows((first, last) => client.from("work_log_days").select("user_id,work_date")
      .eq("studio_id", studio).gte("work_date", from).lt("work_date", until).order("user_id").order("work_date").range(first, last)),
    loadAllRows((first, last) => client.from("studio_members").select("user_id,is_active,joined_at,profile:profiles!studio_members_user_id_fkey(full_name,is_active,avatar_url)")
      .eq("studio_id", studio).order("id").range(first, last)),
    loadAllRows((first, last) => client.from("review_timer_sessions")
      .select("id,work_session_id,user_id,state,started_at,paused_at,members:review_timer_members(round_id,finished_at,round:task_review_rounds!review_timer_members_round_id_fkey(task:tasks!task_review_rounds_task_id_fkey(id,title,project_id,project:projects!tasks_project_id_fkey(id,name))))")
      .eq("studio_id", studio).lt("started_at", zonedWallTimeToIso(`${until}T00:00`))
      .or(`paused_at.gte.${zonedWallTimeToIso(`${from}T00:00`)},paused_at.is.null`).order("started_at").order("id").range(first, last)),
    getStatisticsWorkday(client, studio, today),
    // Only approved dates are context; partial absences do not create an invented adjusted target.
    loadAllRows((first, last) => client.from("time_off_requests").select("user_id,start_date,end_date")
      .eq("studio_id", studio).eq("status", "approved").is("cancelled_at", null)
      .lt("start_date", until).gte("end_date", from).order("id").range(first, last)),
    loadAllRows((first, last) => client.from("studio_days_off").select("date")
      .eq("studio_id", studio).gte("date", from).lt("date", until).order("date").range(first, last)),
    // Recurrence templates and moved/cancelled overrides must be loaded together.
    loadAllRows((first, last) => client.from("calendar_events")
      .select("id,title,event_type,starts_at,ends_at,all_day,project_id,organizer_id,assignee_id,cancelled_at,recurrence_rule,series_id,occurrence_start,compensates_time_off_request_id,project:projects!calendar_events_project_id_fkey(id,name),invites:calendar_event_invites(event_id,user_id,status),participants:calendar_event_participants(event_id,user_id)")
      .eq("studio_id", studio).order("id").range(first, last)),
  ]);
  for (const result of [entries, submissions, people, timers, timeOff, daysOff, events]) {
    if (result.error || !result.data) throw new Error("Unable to load team activity.", { cause: result.error });
  }
  return buildTeamActivity({ month, today, workdayMinutes, entries: entries.data ?? [], submissions: submissions.data ?? [], timers: timers.data ?? [],
    people: (people.data ?? []).map(row => ({ id: row.user_id, name: row.profile?.full_name ?? "", active: row.is_active && !!row.profile?.is_active,
      avatarUrl: row.profile?.avatar_url ?? null, joinedDate: row.joined_at ? instantToDateOnly(row.joined_at) : null })),
    events: events.data ?? [], timeOff: timeOff.data ?? [], studioDaysOff: (daysOff.data ?? []).map(day => day.date) });
}
