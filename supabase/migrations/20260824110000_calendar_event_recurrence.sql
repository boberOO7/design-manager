-- A series is one calendar_events row.  Exceptions are ordinary event rows
-- linked to their series and replace (or cancel) one generated occurrence.
alter table public.calendar_events
  add column recurrence_rule jsonb,
  add column series_id uuid references public.calendar_events(id) on delete cascade,
  add column occurrence_start timestamptz;

alter table public.calendar_events add constraint calendar_events_recurrence_rule_check check (
  recurrence_rule is null or (
    jsonb_typeof(recurrence_rule) = 'object'
    and recurrence_rule->>'frequency' in ('daily', 'weekly', 'monthly', 'yearly')
    and coalesce((recurrence_rule->>'interval')::integer, 0) between 1 and 99
  )
);
alter table public.calendar_events add constraint calendar_events_series_exception_check check (
  (series_id is null and occurrence_start is null) or (series_id is not null and occurrence_start is not null and recurrence_rule is null)
);
create unique index calendar_events_series_occurrence_idx on public.calendar_events(series_id, occurrence_start) where series_id is not null;
create index calendar_events_series_idx on public.calendar_events(studio_id, series_id, occurrence_start) where series_id is not null;

-- Replace the creation RPC so a recurrence rule is inserted atomically with
-- the series and its invitations. No future occurrence rows are generated.
drop function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[]);
create function public.create_calendar_event_with_invites(
  p_studio_id uuid, p_project_id uuid, p_title text, p_description text,
  p_event_type public.calendar_event_type, p_starts_at timestamptz, p_ends_at timestamptz,
  p_all_day boolean, p_location text, p_meeting_url text, p_attendee_ids uuid[] default '{}'::uuid[],
  p_recurrence_rule jsonb default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_event_id uuid;
begin
  insert into public.calendar_events (studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, recurrence_rule, created_by, organizer_id)
  values (p_studio_id, p_project_id, p_title, p_description, p_event_type, p_starts_at, p_ends_at, p_all_day, p_location, p_meeting_url, p_recurrence_rule, (select auth.uid()), (select auth.uid()))
  returning id into new_event_id;
  insert into public.calendar_event_invites (event_id, user_id, status, invited_by)
  select new_event_id, attendee_id, 'pending'::public.calendar_event_invitation_status, (select auth.uid())
  from (select distinct attendee_id from unnest(coalesce(p_attendee_ids, '{}'::uuid[])) as attendee_id) as invitees
  where attendee_id <> (select auth.uid());
  return new_event_id;
end; $$;
revoke execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb) from public, anon;
grant execute on function public.create_calendar_event_with_invites(uuid, uuid, text, text, public.calendar_event_type, timestamptz, timestamptz, boolean, text, text, uuid[], jsonb) to authenticated;
