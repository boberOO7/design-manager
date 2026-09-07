-- Completed projects can still require follow-up calendar work. Keep this
-- exception inside Calendar: archived projects remain unavailable, and project
-- task/lifecycle rules are unchanged.
create or replace function private.can_manage_calendar_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.calendar_events as event
    left join public.projects as project on project.id = event.project_id
    where event.id = target_event_id
      and private.is_studio_member(event.studio_id)
      and (private.is_studio_admin(event.studio_id) or event.organizer_id = (select auth.uid()))
      and event.cancelled_at is null
      and (event.project_id is null or project.status in ('planned', 'active', 'paused', 'completed'))
  );
$$;

create or replace function private.validate_calendar_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); project_studio_id uuid; project_status text; series_studio_id uuid; day_off public.time_off_requests%rowtype;
begin
  if tg_op = 'INSERT' then
    if not private.is_studio_member(new.studio_id) then raise exception 'Only an active studio member may create events'; end if;
    if new.created_by is distinct from actor or new.organizer_id is distinct from actor then raise exception 'Event creator and organizer must be the authenticated user'; end if;
    if new.cancelled_at is not null and not (new.series_id is not null and new.occurrence_start is not null and new.recurrence_rule is null) then raise exception 'New events cannot start cancelled'; end if;
    if new.series_id is not null then
      select studio_id into series_studio_id from public.calendar_events where id = new.series_id;
      if series_studio_id is distinct from new.studio_id then raise exception 'Event series must belong to the same studio'; end if;
    end if;
  else
    if not private.can_manage_calendar_event(old.id) then raise exception 'Only the organizer or an active studio administrator may manage events'; end if;
    if old.cancelled_at is not null then raise exception 'Cancelled events are read-only'; end if;
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id or new.created_by is distinct from old.created_by or new.organizer_id is distinct from old.organizer_id or new.created_at is distinct from old.created_at then raise exception 'Event ownership fields cannot be changed'; end if;
    if new.cancelled_at is not null and (new.title is distinct from old.title or new.project_id is distinct from old.project_id or new.event_type is distinct from old.event_type or new.description is distinct from old.description or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url or new.recurrence_rule is distinct from old.recurrence_rule or new.series_id is distinct from old.series_id or new.occurrence_start is distinct from old.occurrence_start or new.compensates_time_off_request_id is distinct from old.compensates_time_off_request_id or new.assignee_id is distinct from old.assignee_id) then raise exception 'Cancelling an event cannot change event details'; end if;
    if new.cancelled_at is not null then return new; end if;
  end if;
  if new.compensates_time_off_request_id is not null then
    if new.event_type <> 'work_makeup' then raise exception 'Only work makeup events can compensate time off'; end if;
    if new.recurrence_rule is not null or new.series_id is not null then raise exception 'Linked work makeup events cannot recur'; end if;
    select * into day_off from public.time_off_requests where id = new.compensates_time_off_request_id;
    if day_off.id is null or day_off.studio_id is distinct from new.studio_id or day_off.user_id is distinct from new.organizer_id or day_off.request_type <> 'day_off' or day_off.status <> 'approved' or day_off.cancelled_at is not null then raise exception 'Work makeup must link to the organizer’s approved day-off request'; end if;
  end if;
  if new.project_id is not null then
    if not private.can_access_project(new.project_id) then raise exception 'Event project is not accessible to the event organizer'; end if;
    select studio_id, status into project_studio_id, project_status from public.projects where id = new.project_id;
    if project_studio_id is distinct from new.studio_id then raise exception 'Event project must belong to the same studio'; end if;
    if project_status not in ('planned', 'active', 'paused', 'completed') then raise exception 'Archived projects cannot receive calendar events'; end if;
  end if;
  if new.event_type = 'site_visit' then
    if new.project_id is null or new.assignee_id is null then raise exception 'Site visits require a project and assignee'; end if;
    if new.all_day or new.recurrence_rule is not null or new.meeting_url is not null then raise exception 'Site visits must be timed, non-recurring, and cannot have a meeting link'; end if;
    if (new.starts_at at time zone 'Europe/Kyiv')::date <> (new.ends_at at time zone 'Europe/Kyiv')::date then raise exception 'Site visits must start and end on the same Europe/Kyiv calendar day'; end if;
    if not private.is_studio_admin(new.studio_id) and new.assignee_id is distinct from actor then raise exception 'Employees may assign site visits only to themselves'; end if;
    if not exists (select 1 from public.project_members assignment inner join public.studio_members membership on membership.user_id = assignment.user_id and membership.studio_id = new.studio_id and membership.is_active inner join public.profiles profile on profile.id = assignment.user_id and profile.is_active where assignment.project_id = new.project_id and assignment.user_id = new.assignee_id and assignment.is_active) then raise exception 'Site visit assignee must be an active project member'; end if;
  elsif new.event_type = 'interview' then
    if not private.is_studio_admin(new.studio_id) then raise exception 'Only active studio administrators may create or manage interviews'; end if;
    if new.project_id is not null or new.assignee_id is null or new.all_day or new.recurrence_rule is not null or new.location is not null then raise exception 'Interviews require one interviewer and must be timed, non-recurring, project-free, and without a location'; end if;
    if (new.starts_at at time zone 'Europe/Kyiv')::date <> (new.ends_at at time zone 'Europe/Kyiv')::date then raise exception 'Interviews must start and end on the same Europe/Kyiv calendar day'; end if;
    if not exists (select 1 from public.studio_members membership inner join public.profiles profile on profile.id = membership.user_id where membership.studio_id = new.studio_id and membership.user_id = new.assignee_id and membership.system_role = 'admin' and membership.is_active and profile.is_active) then raise exception 'Interview interviewer must be an active studio administrator'; end if;
  elsif new.event_type = 'business_trip' then
    if new.project_id is null or new.recurrence_rule is not null or new.meeting_url is not null or new.assignee_id is not null then raise exception 'Business trips require a project and cannot repeat, link meetings, or use an assignee'; end if;
  elsif new.assignee_id is not null then raise exception 'Only site visits and interviews can have an assignee'; end if;
  return new;
end;
$$;

drop policy if exists calendar_events_insert_organizer_or_admin on public.calendar_events;
create policy calendar_events_insert_organizer_or_admin
on public.calendar_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and organizer_id = (select auth.uid())
  and (select private.is_studio_member(studio_id))
  and (
    project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = calendar_events.project_id
        and project.studio_id = calendar_events.studio_id
        and project.status in ('planned', 'active', 'paused', 'completed')
        and (select private.can_access_project(project.id))
    )
  )
);
