-- Required event inputs precede nullable event metadata so generated RPC types
-- accurately model the existing event-type-specific optional fields.
drop function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb, uuid, uuid, uuid[], text);

create function public.create_calendar_event_with_invites(
  p_studio_id uuid,
  p_title text,
  p_event_type public.calendar_event_type,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_project_id uuid default null,
  p_description text default null,
  p_location text default null,
  p_meeting_url text default null,
  p_attendee_ids uuid[] default '{}'::uuid[],
  p_recurrence_rule jsonb default null,
  p_compensates_time_off_request_id uuid default null,
  p_assignee_id uuid default null,
  p_participant_ids uuid[] default '{}'::uuid[],
  p_meeting_mode text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
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
      insert into public.calendar_event_participants (event_id, user_id, assigned_by) values (new_event_id, participant_id, (select auth.uid())) on conflict do nothing;
    end loop;
  elsif p_event_type not in ('site_visit', 'interview') then
    insert into public.calendar_event_invites (event_id, user_id, status, invited_by)
    select new_event_id, attendee_id, 'pending'::public.calendar_event_invitation_status, (select auth.uid())
    from (select distinct attendee_id from unnest(coalesce(p_attendee_ids, '{}'::uuid[])) as attendee_id) as invitees
    where p_event_type = 'general' or attendee_id <> (select auth.uid());
  end if;
  return new_event_id;
end;
$$;

revoke execute on function public.create_calendar_event_with_invites(uuid, text, public.calendar_event_type, timestamptz, timestamptz, boolean, uuid, text, text, text, uuid[], jsonb, uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.create_calendar_event_with_invites(uuid, text, public.calendar_event_type, timestamptz, timestamptz, boolean, uuid, text, text, text, uuid[], jsonb, uuid, uuid, uuid[], text) to authenticated;
