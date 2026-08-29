-- Interviews use the existing calendar-event assignee as their one responsible
-- interviewer. They are never project events or invitations.
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
    if project_status not in ('planned', 'active', 'paused') then raise exception 'Events on completed or archived projects may only be cancelled'; end if;
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

create or replace function private.validate_calendar_event_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_row public.calendar_events%rowtype; actor uuid := (select auth.uid());
begin
  select * into event_row from public.calendar_events where id = case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  if event_row.id is null or event_row.cancelled_at is not null then raise exception 'Event invitations are unavailable'; end if;
  if tg_op = 'INSERT' then
    if event_row.event_type = 'interview' then raise exception 'Interviews do not use invitations'; end if;
    if not private.can_manage_calendar_event(new.event_id) then raise exception 'Only an active studio administrator may manage invitations'; end if;
    if new.user_id = event_row.organizer_id or new.invited_by is distinct from actor or new.status <> 'pending' or new.responded_at is not null then raise exception 'Invalid calendar invitation'; end if;
    if not exists (select 1 from public.studio_members member join public.profiles profile on profile.id = member.user_id where member.studio_id = event_row.studio_id and member.user_id = new.user_id and member.is_active and profile.is_active) then raise exception 'Invitee must be an active studio member'; end if;
    if event_row.project_id is not null and event_row.event_type not in ('meeting', 'client_presentation') and not exists (select 1 from public.project_members assignment where assignment.project_id = event_row.project_id and assignment.user_id = new.user_id and assignment.is_active) then raise exception 'Project event invitees must be active project members'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not private.can_manage_calendar_event(old.event_id) then raise exception 'Only an active studio administrator may remove invitations'; end if;
    return old;
  end if;
  if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id or new.invited_by is distinct from old.invited_by or new.created_at is distinct from old.created_at then raise exception 'Invitation ownership fields cannot be changed'; end if;
  if actor is distinct from old.user_id or new.status not in ('accepted', 'declined') or new.status = old.status then raise exception 'Only the invited user may change their RSVP'; end if;
  new.responded_at := now();
  return new;
end;
$$;

create or replace function public.create_calendar_event_with_invites(
  p_studio_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_event_type public.calendar_event_type,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_location text,
  p_meeting_url text,
  p_attendee_ids uuid[] default '{}'::uuid[],
  p_recurrence_rule jsonb default null,
  p_compensates_time_off_request_id uuid default null,
  p_assignee_id uuid default null,
  p_participant_ids uuid[] default '{}'::uuid[],
  p_meeting_mode text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare new_event_id uuid; participant_id uuid;
begin
  if p_event_type = 'business_trip' then
    if not private.is_studio_admin(p_studio_id) then p_participant_ids := array[(select auth.uid())]; end if;
    perform public.validate_business_trip_participants(p_studio_id, p_project_id, p_participant_ids);
  end if;

  insert into public.calendar_events (studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, meeting_mode, recurrence_rule, compensates_time_off_request_id, assignee_id, created_by, organizer_id)
  values (p_studio_id, p_project_id, p_title, p_description, p_event_type, p_starts_at, p_ends_at, p_all_day, p_location, p_meeting_url, case when p_event_type in ('meeting', 'client_presentation') then coalesce(p_meeting_mode, 'offline') else null end, p_recurrence_rule, p_compensates_time_off_request_id, p_assignee_id, (select auth.uid()), (select auth.uid()))
  returning id into new_event_id;

  if p_event_type = 'business_trip' then
    foreach participant_id in array coalesce(p_participant_ids, '{}'::uuid[]) loop
      insert into public.calendar_event_participants (event_id, user_id, assigned_by)
      values (new_event_id, participant_id, (select auth.uid())) on conflict do nothing;
    end loop;
  elsif p_event_type not in ('site_visit', 'interview') then
    insert into public.calendar_event_invites (event_id, user_id, status, invited_by)
    select new_event_id, attendee_id, 'pending'::public.calendar_event_invitation_status, (select auth.uid())
    from (select distinct attendee_id from unnest(coalesce(p_attendee_ids, '{}'::uuid[])) as attendee_id) as invitees
    where attendee_id <> (select auth.uid());
  end if;
  return new_event_id;
end;
$$;

revoke execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb, uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb, uuid, uuid, uuid[], text) to authenticated;
