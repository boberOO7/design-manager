-- The semantic-type migration renamed the enum value in place. PL/pgSQL bodies
-- retain enum literals as source text, so recreate the affected runtime
-- functions with the canonical presentation key.
create or replace function private.validate_meeting_presentation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.cancelled_at is not null then
    return new;
  end if;

  if new.event_type in ('meeting', 'presentation') then
    if new.all_day or new.recurrence_rule is not null then
      raise exception 'Meetings and presentations must be timed and non-recurring';
    end if;
    if (new.starts_at at time zone 'Europe/Kyiv')::date <> (new.ends_at at time zone 'Europe/Kyiv')::date then
      raise exception 'Meetings and presentations must start and end on the same Europe/Kyiv calendar day';
    end if;
    if new.meeting_mode = 'offline' and new.meeting_url is not null then
      raise exception 'Offline meetings cannot include a meeting link';
    end if;
    if new.meeting_mode = 'online' and new.location is not null then
      raise exception 'Online meetings cannot include a location';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_meeting_presentation_event() from public, anon, authenticated;

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
    if event_row.project_id is not null and event_row.event_type not in ('meeting', 'presentation') and not exists (select 1 from public.project_members assignment where assignment.project_id = event_row.project_id and assignment.user_id = new.user_id and assignment.is_active) then raise exception 'Project event invitees must be active project members'; end if;
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
  values (p_studio_id, p_project_id, p_title, p_description, p_event_type, p_starts_at, p_ends_at, p_all_day, p_location, p_meeting_url, case when p_event_type in ('meeting', 'presentation') then coalesce(p_meeting_mode, 'offline') else null end, p_recurrence_rule, p_compensates_time_off_request_id, p_assignee_id, (select auth.uid()), (select auth.uid()))
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
