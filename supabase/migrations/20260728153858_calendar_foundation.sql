create type public.calendar_event_type as enum (
  'meeting',
  'client_presentation',
  'site_visit',
  'internal_review',
  'other'
);

create type public.time_off_request_type as enum (
  'vacation',
  'day_off',
  'medical_appointment',
  'sick_leave',
  'other'
);

create type public.time_off_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_id uuid references public.projects(id) on delete restrict,
  title text not null check (title = btrim(title) and length(title) between 1 and 200),
  description text check (description is null or length(description) <= 5000),
  event_type public.calendar_event_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (location is null or length(location) <= 300),
  meeting_url text check (meeting_url is null or length(meeting_url) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create table public.calendar_event_attendees (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  request_type public.time_off_request_type not null,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default true,
  private_note text check (private_note is null or length(private_note) <= 2000),
  status public.time_off_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (end_date >= start_date),
  check (
    (all_day and start_time is null and end_time is null)
    or (
      not all_day
      and start_date = end_date
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
  ),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and cancelled_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create index calendar_events_studio_range_idx
on public.calendar_events (studio_id, starts_at, ends_at)
where cancelled_at is null;

create index calendar_events_project_idx
on public.calendar_events (project_id)
where project_id is not null and cancelled_at is null;

create index calendar_event_attendees_user_idx
on public.calendar_event_attendees (user_id, event_id);

create index time_off_requests_studio_range_idx
on public.time_off_requests (studio_id, start_date, end_date, status);

create index time_off_requests_user_idx
on public.time_off_requests (user_id, created_at desc);

create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

create trigger set_time_off_requests_updated_at
before update on public.time_off_requests
for each row execute function public.set_updated_at();

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

create trigger validate_calendar_event_before_write
before insert or update on public.calendar_events
for each row execute function private.validate_calendar_event();

create or replace function private.can_view_calendar_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.calendar_events as event
    where event.id = target_event_id
      and private.is_studio_member(event.studio_id)
      and (
        private.is_studio_admin(event.studio_id)
        or (
          event.cancelled_at is null
          and (
            event.project_id is null
            or private.can_access_project(event.project_id)
            or exists (
              select 1
              from public.calendar_event_attendees as attendee
              where attendee.event_id = event.id
                and attendee.user_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

revoke execute on function private.can_view_calendar_event(uuid)
from public, anon;
grant execute on function private.can_view_calendar_event(uuid)
to authenticated;

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

create trigger validate_calendar_event_attendee_before_write
before insert or update or delete on public.calendar_event_attendees
for each row execute function private.validate_calendar_event_attendee();

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
    if not actor_is_admin and new.user_id is distinct from actor_id then
      raise exception 'Employees may request time off only for themselves';
    end if;
    if new.status <> 'pending' or new.reviewed_by is not null or new.reviewed_at is not null
      or new.review_note is not null or new.cancelled_at is not null then
      raise exception 'New time-off requests must start pending and unreviewed';
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
    select 1 from public.studio_members as reviewer
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

create trigger validate_time_off_request_before_write
before insert or update on public.time_off_requests
for each row execute function private.validate_time_off_request();

alter table public.calendar_events enable row level security;
alter table public.calendar_event_attendees enable row level security;
alter table public.time_off_requests enable row level security;

create policy calendar_events_select_visible
on public.calendar_events for select to authenticated
using ((select private.can_view_calendar_event(id)));

create policy calendar_events_insert_admin
on public.calendar_events for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.is_studio_admin(studio_id)));

create policy calendar_events_update_admin
on public.calendar_events for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));

create policy calendar_event_attendees_select_visible
on public.calendar_event_attendees for select to authenticated
using ((select private.can_view_calendar_event(event_id)));

create policy calendar_event_attendees_insert_admin
on public.calendar_event_attendees for insert to authenticated
with check ((select private.can_manage_calendar_event(event_id)));

create policy calendar_event_attendees_delete_admin
on public.calendar_event_attendees for delete to authenticated
using ((select private.can_manage_calendar_event(event_id)));

create policy time_off_requests_select_own_or_admin
on public.time_off_requests for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)));

create policy time_off_requests_insert_own_or_admin
on public.time_off_requests for insert to authenticated
with check (
  (user_id = (select auth.uid()) and (select private.is_studio_member(studio_id)))
  or (select private.is_studio_admin(studio_id))
);

create policy time_off_requests_update_own_or_admin
on public.time_off_requests for update to authenticated
using (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)))
with check (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)));

revoke all on table public.calendar_events, public.calendar_event_attendees, public.time_off_requests
from anon, authenticated;

grant select on table public.calendar_events, public.calendar_event_attendees
to authenticated;
grant insert (studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, created_by)
on table public.calendar_events to authenticated;
grant update (project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, cancelled_at)
on table public.calendar_events to authenticated;
grant insert (event_id, user_id), delete
on table public.calendar_event_attendees to authenticated;

grant select on table public.time_off_requests to authenticated;
grant insert (studio_id, user_id, request_type, start_date, end_date, start_time, end_time, all_day, private_note)
on table public.time_off_requests to authenticated;
grant update (request_type, start_date, end_date, start_time, end_time, all_day, private_note, status, reviewed_by, reviewed_at, review_note, cancelled_at)
on table public.time_off_requests to authenticated;

create or replace function public.get_calendar_coworker_availability(
  target_studio_id uuid,
  range_start date,
  range_end date
)
returns table (
  id uuid,
  user_id uuid,
  employee_name text,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  all_day boolean,
  label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request.id,
    request.user_id,
    profile.full_name,
    request.start_date,
    request.end_date,
    request.start_time,
    request.end_time,
    request.all_day,
    'Out of office'::text
  from public.time_off_requests as request
  inner join public.profiles as profile on profile.id = request.user_id
  where private.is_studio_member(target_studio_id)
    and request.studio_id = target_studio_id
    and range_start <= range_end
    and request.status = 'approved'
    and request.cancelled_at is null
    and request.user_id <> (select auth.uid())
    and request.start_date <= range_end
    and request.end_date >= range_start
  order by request.start_date, profile.full_name;
$$;

revoke execute on function public.get_calendar_coworker_availability(uuid, date, date)
from public, anon;
grant execute on function public.get_calendar_coworker_availability(uuid, date, date)
to authenticated;
