-- Keep the event, its invitations, and invitation-triggered notifications in
-- one transaction. If an invitee is invalid or notification persistence fails,
-- PostgreSQL rolls the event insert back as well.
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
  p_attendee_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_event_id uuid;
begin
  insert into public.calendar_events (
    studio_id,
    project_id,
    title,
    description,
    event_type,
    starts_at,
    ends_at,
    all_day,
    location,
    meeting_url,
    created_by,
    organizer_id
  ) values (
    p_studio_id,
    p_project_id,
    p_title,
    p_description,
    p_event_type,
    p_starts_at,
    p_ends_at,
    p_all_day,
    p_location,
    p_meeting_url,
    (select auth.uid()),
    (select auth.uid())
  ) returning id into new_event_id;

  insert into public.calendar_event_invites (event_id, user_id, status, invited_by)
  select new_event_id, attendee_id, 'pending'::public.calendar_event_invitation_status, (select auth.uid())
  from (
    select distinct attendee_id
    from unnest(coalesce(p_attendee_ids, '{}'::uuid[])) as attendee_id
  ) as invitees
  where attendee_id <> (select auth.uid());

  return new_event_id;
end;
$$;

revoke execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[]) from public, anon;
grant execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[]) to authenticated;
