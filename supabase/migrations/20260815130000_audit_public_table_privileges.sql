-- The Data API enforces PostgreSQL grants before RLS. Keep every public
-- application table explicit so a missing default grant cannot bypass the
-- intended RLS policy or break an authenticated request with 42501.
revoke all on table
  public.studios,
  public.profiles,
  public.studio_members,
  public.projects,
  public.project_members,
  public.project_area_progress,
  public.tasks,
  public.task_checklist_items,
  public.project_activity,
  public.productivity_attributions,
  public.calendar_events,
  public.calendar_event_attendees,
  public.time_off_requests,
  public.notifications,
  public.checklist_templates,
  public.checklist_template_items,
  public.contractors
from anon;

revoke all on table
  public.studios,
  public.profiles,
  public.studio_members,
  public.projects,
  public.project_members,
  public.project_area_progress,
  public.tasks,
  public.task_checklist_items,
  public.project_activity,
  public.productivity_attributions,
  public.calendar_events,
  public.calendar_event_attendees,
  public.time_off_requests,
  public.notifications,
  public.checklist_templates,
  public.checklist_template_items,
  public.contractors
from authenticated;

-- Remove legacy public-schema defaults (Dxtm) from all current tables.
-- Trusted server code only needs CRUD access to the three bootstrap tables.
revoke all on table
  public.studios,
  public.profiles,
  public.studio_members,
  public.projects,
  public.project_members,
  public.project_area_progress,
  public.tasks,
  public.task_checklist_items,
  public.project_activity,
  public.productivity_attributions,
  public.calendar_events,
  public.calendar_event_attendees,
  public.time_off_requests,
  public.notifications,
  public.checklist_templates,
  public.checklist_template_items,
  public.contractors
from service_role;

-- Authenticated reads are all RLS-scoped. This covers direct and embedded
-- selects performed by the server and browser Supabase clients.
grant select on table
  public.studios,
  public.profiles,
  public.studio_members,
  public.projects,
  public.project_members,
  public.project_area_progress,
  public.tasks,
  public.task_checklist_items,
  public.project_activity,
  public.productivity_attributions,
  public.calendar_events,
  public.calendar_event_attendees,
  public.time_off_requests,
  public.notifications,
  public.checklist_templates,
  public.checklist_template_items,
  public.contractors
to authenticated;

-- Direct authenticated writes use the existing RLS policies and triggers.
-- Keep them column-scoped where the client does not need whole-row writes.
grant insert (
  studio_id, name, project_type, country_code, city, city_geonames_id,
  client_name, description, total_area_m2, status, priority, start_date,
  due_date, created_by
) on table public.projects to authenticated;

grant update (
  name, project_type, country_code, city, city_geonames_id, client_name,
  description, total_area_m2, status, priority, start_date, due_date,
  completed_at, archived_at, progress_method
) on table public.projects to authenticated;

grant insert (
  project_id, user_id, project_role, assigned_area_m2, assigned_at
) on table public.project_members to authenticated;

grant insert (
  project_id, title, description, priority, assignee_id, created_by,
  due_date, completed_area_m2
) on table public.tasks to authenticated;

grant update (
  title, description, assignee_id, priority, due_date, completed_area_m2,
  production_completion, progress_weight, status
) on table public.tasks to authenticated;

grant insert (task_id, title, is_completed, weight, position)
on table public.task_checklist_items to authenticated;
grant update (title, is_completed, weight)
on table public.task_checklist_items to authenticated;
grant delete on table public.task_checklist_items to authenticated;

grant insert (
  studio_id, project_id, title, description, event_type, starts_at, ends_at,
  all_day, location, meeting_url, created_by
) on table public.calendar_events to authenticated;
grant update (
  project_id, title, description, event_type, starts_at, ends_at, all_day,
  location, meeting_url, cancelled_at
) on table public.calendar_events to authenticated;

grant insert (event_id, user_id)
on table public.calendar_event_attendees to authenticated;
grant delete on table public.calendar_event_attendees to authenticated;

grant insert (
  studio_id, user_id, request_type, start_date, end_date, start_time,
  end_time, all_day, private_note
) on table public.time_off_requests to authenticated;
grant update (
  request_type, start_date, end_date, start_time, end_time, all_day,
  private_note, status, reviewed_by, reviewed_at, review_note, cancelled_at
) on table public.time_off_requests to authenticated;

grant update (read_at) on table public.notifications to authenticated;

grant insert (category, name, website_url, phone, description, created_by)
on table public.contractors to authenticated;
grant update (category, name, website_url, phone, description)
on table public.contractors to authenticated;
grant delete on table public.contractors to authenticated;

-- Employee bootstrap is the only current service-role table access. Keep this
-- explicit for trusted server code without exposing it to ordinary users.
grant select, insert, update on table public.studios to service_role;
grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.studio_members to service_role;

-- Future public tables and sequences receive no implicit Data API privileges.
-- Every needed grant remains explicit in its owning migration.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
