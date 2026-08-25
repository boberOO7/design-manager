-- calendar_events uses restricted, column-scoped Data API privileges.  The
-- recurrence migration added these columns after the baseline grants, while
-- its SECURITY INVOKER RPC writes recurrence_rule as the caller.
grant insert (recurrence_rule)
on table public.calendar_events to authenticated;

grant update (recurrence_rule)
on table public.calendar_events to authenticated;

-- A single-occurrence override is an event row linked to its parent series.
-- A cancellation is the same exception row, initially marked cancelled.
grant insert (series_id, occurrence_start, cancelled_at)
on table public.calendar_events to authenticated;

-- The current invitation path already has the exact insert grant required by
-- the invoker RPC: (event_id, user_id, status, invited_by).  No broad invite
-- privilege is added here.

-- Allow only a recurrence exception to be born cancelled. This preserves the
-- existing ban on creating arbitrary cancelled events, while making the
-- cancellation write path above reachable after its column grants are fixed.
create or replace function private.validate_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  project_studio_id uuid;
  project_status text;
  series_studio_id uuid;
begin
  if tg_op = 'INSERT' then
    if not private.is_studio_member(new.studio_id) then
      raise exception 'Only an active studio member may create events';
    end if;
    if new.created_by is distinct from actor or new.organizer_id is distinct from actor then
      raise exception 'Event creator and organizer must be the authenticated user';
    end if;
    if new.cancelled_at is not null
      and not (new.series_id is not null and new.occurrence_start is not null and new.recurrence_rule is null) then
      raise exception 'New events cannot start cancelled';
    end if;
    if new.series_id is not null then
      select studio_id into series_studio_id from public.calendar_events where id = new.series_id;
      if series_studio_id is distinct from new.studio_id then
        raise exception 'Event series must belong to the same studio';
      end if;
    end if;
  else
    if not private.can_manage_calendar_event(old.id) then
      raise exception 'Only the organizer or an active studio administrator may manage events';
    end if;
    if old.cancelled_at is not null then
      raise exception 'Cancelled events are read-only';
    end if;
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id or new.created_by is distinct from old.created_by or new.organizer_id is distinct from old.organizer_id or new.created_at is distinct from old.created_at then
      raise exception 'Event ownership fields cannot be changed';
    end if;
    if new.cancelled_at is not null and (new.title is distinct from old.title or new.project_id is distinct from old.project_id or new.event_type is distinct from old.event_type or new.description is distinct from old.description or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url or new.recurrence_rule is distinct from old.recurrence_rule or new.series_id is distinct from old.series_id or new.occurrence_start is distinct from old.occurrence_start) then
      raise exception 'Cancelling an event cannot change event details';
    end if;
    if new.cancelled_at is not null then
      return new;
    end if;
  end if;

  if new.project_id is not null then
    if not private.can_access_project(new.project_id) then
      raise exception 'Event project is not accessible to the event organizer';
    end if;
    select studio_id, status into project_studio_id, project_status from public.projects where id = new.project_id;
    if project_studio_id is distinct from new.studio_id then
      raise exception 'Event project must belong to the same studio';
    end if;
    if project_status not in ('planned', 'active', 'paused') then
      raise exception 'Events on completed or archived projects may only be cancelled';
    end if;
  end if;
  return new;
end;
$$;
