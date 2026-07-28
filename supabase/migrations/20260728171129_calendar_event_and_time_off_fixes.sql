create or replace function private.validate_calendar_event_all_day_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.cancelled_at is not null then
    return new;
  end if;

  if new.all_day and (
    (new.starts_at at time zone 'Europe/Kyiv')::time <> time '00:00'
    or (new.ends_at at time zone 'Europe/Kyiv')::time <> time '00:00'
  ) then
    raise exception 'All-day events must start and end at Europe/Kyiv calendar-day boundaries';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_calendar_event_all_day_bounds()
from public, anon, authenticated;

create trigger validate_calendar_event_all_day_bounds_before_write
before insert or update on public.calendar_events
for each row execute function private.validate_calendar_event_all_day_bounds();

create or replace function private.initialize_time_off_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if new.user_id is distinct from actor_id then
    raise exception 'Time-off requests must belong to the authenticated user';
  end if;

  new.cancelled_at := null;
  new.review_note := null;

  if private.is_studio_admin(new.studio_id) then
    new.status := 'approved';
    new.reviewed_by := actor_id;
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function private.initialize_time_off_request_status()
from public, anon, authenticated;

create trigger initialize_time_off_request_status_before_insert
before insert on public.time_off_requests
for each row execute function private.initialize_time_off_request_status();

create or replace function private.validate_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_admin boolean;
begin
  if not exists (
    select 1
    from public.studio_members as membership
    inner join public.profiles as profile on profile.id = membership.user_id
    where membership.studio_id = new.studio_id
      and membership.user_id = new.user_id
      and membership.is_active = true
      and profile.is_active = true
  ) then
    raise exception 'Time-off user must be an active studio member';
  end if;

  actor_is_admin := coalesce(private.is_studio_admin(new.studio_id), false);

  if tg_op = 'INSERT' then
    if new.user_id is distinct from actor_id then
      raise exception 'Time-off requests must belong to the authenticated user';
    end if;

    if actor_is_admin then
      if new.status <> 'approved'
        or new.reviewed_by is distinct from actor_id
        or new.reviewed_at is null
        or new.review_note is not null
        or new.cancelled_at is not null then
        raise exception 'Administrator time-off requests must be approved by their creator';
      end if;
    elsif new.status <> 'pending'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is not null then
      raise exception 'Employee time-off requests must start pending and unreviewed';
    end if;

    return new;
  end if;

  if new.studio_id is distinct from old.studio_id
    or new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Time-off ownership fields cannot be changed';
  end if;

  if old.status = 'cancelled' then
    raise exception 'Cancelled time-off requests are read-only';
  end if;

  if old.status in ('approved', 'rejected') then
    if new.status = old.status then
      raise exception 'Reviewed time-off requests are read-only';
    end if;

    if not actor_is_admin or new.status <> 'cancelled' then
      raise exception 'Only administrators may cancel reviewed time-off requests';
    end if;

    if new.cancelled_at is null
      or new.request_type is distinct from old.request_type
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.all_day is distinct from old.all_day
      or new.private_note is distinct from old.private_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note then
      raise exception 'Cancelling a reviewed request must preserve request and review details';
    end if;

    return new;
  end if;

  if not actor_is_admin then
    if old.user_id is distinct from actor_id
      or old.status <> 'pending'
      or new.status <> 'cancelled'
      or new.request_type is distinct from old.request_type
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.all_day is distinct from old.all_day
      or new.private_note is distinct from old.private_note
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is null then
      raise exception 'Employees may only cancel their own pending request';
    end if;
    return new;
  end if;

  if new.status = 'pending' then
    if new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is not null then
      raise exception 'Pending request edits cannot set review or cancellation fields';
    end if;
  elsif new.status in ('approved', 'rejected') then
    if new.reviewed_by is distinct from actor_id
      or new.reviewed_at is null
      or new.cancelled_at is not null then
      raise exception 'Reviewed requests require the active administrator and review time';
    end if;
  elsif new.status = 'cancelled' then
    if new.cancelled_at is null
      or new.request_type is distinct from old.request_type
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.all_day is distinct from old.all_day
      or new.private_note is distinct from old.private_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note then
      raise exception 'Cancelling a pending request cannot change request details';
    end if;
  else
    raise exception 'Unsupported time-off status transition';
  end if;

  if new.reviewed_by is not null and not exists (
    select 1
    from public.studio_members as reviewer
    where reviewer.studio_id = new.studio_id
      and reviewer.user_id = new.reviewed_by
      and reviewer.system_role = 'admin'
      and reviewer.is_active = true
  ) then
    raise exception 'Reviewer must be an active administrator of the same studio';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_time_off_request()
from public, anon, authenticated;

drop policy time_off_requests_insert_own_or_admin on public.time_off_requests;

create policy time_off_requests_insert_own
on public.time_off_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_studio_member(studio_id))
);

create or replace function private.validate_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_studio_id uuid;
  project_status text;
begin
  if not private.is_studio_admin(new.studio_id) then
    raise exception 'Only an active studio administrator may manage events';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is distinct from (select auth.uid()) then
      raise exception 'Event creator must be the authenticated administrator';
    end if;
    if new.cancelled_at is not null then
      raise exception 'New events cannot start cancelled';
    end if;
  else
    if old.cancelled_at is not null then
      raise exception 'Cancelled events are read-only';
    end if;

    if new.id is distinct from old.id
      or new.studio_id is distinct from old.studio_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Event ownership fields cannot be changed';
    end if;

    if new.cancelled_at is not null then
      if new.title is distinct from old.title
        or new.project_id is distinct from old.project_id
        or new.event_type is distinct from old.event_type
        or new.description is distinct from old.description
        or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
        or new.all_day is distinct from old.all_day
        or new.location is distinct from old.location
        or new.meeting_url is distinct from old.meeting_url then
        raise exception 'Cancelling an event cannot change event details';
      end if;
      return new;
    end if;

    if old.project_id is not null then
      select project.status
        into project_status
      from public.projects as project
      where project.id = old.project_id;

      if project_status is null or project_status not in ('planned', 'active', 'paused') then
        raise exception 'Events on completed or archived projects may only be cancelled';
      end if;
    end if;
  end if;

  if new.project_id is not null then
    select project.studio_id, project.status
      into project_studio_id, project_status
    from public.projects as project
    where project.id = new.project_id;

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

revoke execute on function private.validate_calendar_event()
from public, anon, authenticated;

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
      and private.is_studio_admin(event.studio_id)
      and event.cancelled_at is null
      and (event.project_id is null or project.status in ('planned', 'active', 'paused'))
  );
$$;

revoke execute on function private.can_manage_calendar_event(uuid)
from public, anon;
grant execute on function private.can_manage_calendar_event(uuid)
to authenticated;

create or replace function private.validate_calendar_event_attendee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.calendar_events%rowtype;
  target_event_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.event_id is distinct from old.event_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Attendee ownership fields cannot be changed';
  end if;

  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select * into target_event
  from public.calendar_events as event
  where event.id = target_event_id;

  if target_event.id is null or not private.is_studio_admin(target_event.studio_id) then
    raise exception 'Only an active studio administrator may manage attendees';
  end if;

  if target_event.cancelled_at is not null then
    raise exception 'Cancelled event attendees are read-only';
  end if;

  if target_event.project_id is not null and not exists (
    select 1
    from public.projects as project
    where project.id = target_event.project_id
      and project.status in ('planned', 'active', 'paused')
  ) then
    raise exception 'Attendees on completed or archived project events are read-only';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if not exists (
    select 1
    from public.studio_members as membership
    inner join public.profiles as profile on profile.id = membership.user_id
    where membership.studio_id = target_event.studio_id
      and membership.user_id = new.user_id
      and membership.is_active = true
      and profile.is_active = true
  ) then
    raise exception 'Attendee must be an active member of the event studio';
  end if;

  if target_event.project_id is not null
    and target_event.event_type not in ('meeting', 'client_presentation')
    and not exists (
      select 1
      from public.project_members as assignment
      where assignment.project_id = target_event.project_id
        and assignment.user_id = new.user_id
        and assignment.is_active = true
    ) then
    raise exception 'Project event attendees must be active project members';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_calendar_event_attendee()
from public, anon, authenticated;
