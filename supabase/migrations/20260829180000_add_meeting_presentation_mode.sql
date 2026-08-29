-- Meeting/presentation events are timed, single-day collaboration events.
-- Mode is explicit so an online meeting is not inferred from the presence of a URL.
alter table public.calendar_events
  add column meeting_mode text;

-- The runtime authorization guard expects auth.uid(). Disable only that trigger
-- while this deterministic migration backfill runs, then restore it immediately.
alter table public.calendar_events disable trigger validate_calendar_event_before_write;

-- Preserve the useful signal on existing meeting/presentation records, remove
-- values that would be hidden by the new explicit mode, and keep all unrelated
-- event types semantically free of a meeting mode.
update public.calendar_events
set meeting_mode = case
      when event_type in ('meeting', 'client_presentation') and meeting_url is not null then 'online'
      when event_type in ('meeting', 'client_presentation') then 'offline'
      else null
    end,
    location = case
      when event_type in ('meeting', 'client_presentation') and meeting_url is not null then null
      else location
    end,
    meeting_url = case
      when event_type in ('meeting', 'client_presentation') and meeting_url is null then null
      else meeting_url
    end;

alter table public.calendar_events enable trigger validate_calendar_event_before_write;

alter table public.calendar_events
  add constraint calendar_events_meeting_mode_by_type check (
    (event_type in ('meeting', 'client_presentation') and meeting_mode is not null and meeting_mode in ('offline', 'online'))
    or (event_type not in ('meeting', 'client_presentation') and meeting_mode is null)
  );

grant insert (meeting_mode) on public.calendar_events to authenticated;
grant update (meeting_mode) on public.calendar_events to authenticated;

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

  if new.event_type in ('meeting', 'client_presentation') then
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

create trigger validate_meeting_presentation_event_before_write
before insert or update on public.calendar_events
for each row execute function private.validate_meeting_presentation_event();

drop function if exists public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb, uuid, uuid, uuid[]);
create function public.create_calendar_event_with_invites(
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
  elsif p_event_type <> 'site_visit' then
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
