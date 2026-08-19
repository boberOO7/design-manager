alter type public.calendar_event_type add value if not exists 'business_trip';

do $$ begin
  create type public.calendar_event_invitation_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null;
end $$;

alter table public.calendar_events add column if not exists organizer_id uuid references public.profiles(id) on delete restrict;
-- Existing event rows are backfilled by the migration runner, which has no auth.uid();
-- avoid invoking the user-facing event authorization trigger for this one-time data migration.
alter table public.calendar_events disable trigger validate_calendar_event_before_write;
update public.calendar_events set organizer_id = created_by where organizer_id is null;
alter table public.calendar_events enable trigger validate_calendar_event_before_write;
alter table public.calendar_events alter column organizer_id set not null;

create table public.calendar_event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.calendar_event_invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  check ((status = 'pending' and responded_at is null) or (status in ('accepted', 'declined') and responded_at is not null))
);

insert into public.calendar_event_invites (event_id, user_id, invited_by)
select attendee.event_id, attendee.user_id, event.organizer_id
from public.calendar_event_attendees attendee
join public.calendar_events event on event.id = attendee.event_id
where attendee.user_id <> event.organizer_id
on conflict (event_id, user_id) do nothing;

create index calendar_event_invites_event_idx on public.calendar_event_invites (event_id, created_at);
create index calendar_event_invites_user_idx on public.calendar_event_invites (user_id, status, created_at desc);

create trigger set_calendar_event_invites_updated_at
before update on public.calendar_event_invites
for each row execute function public.set_updated_at();

create or replace function private.can_view_calendar_event(target_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.calendar_events event
    where event.id = target_event_id
      and private.is_studio_member(event.studio_id)
      and (
        private.is_studio_admin(event.studio_id)
        or event.organizer_id = (select auth.uid())
        or exists (
          select 1
          from public.calendar_event_invites invite
          where invite.event_id = event.id
            and invite.user_id = (select auth.uid())
        )
        or (
          event.project_id is not null
          and event.cancelled_at is null
          and private.can_access_project(event.project_id)
        )
      )
  );
$$;

create or replace function private.validate_calendar_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_studio_id uuid; project_status text;
begin
  if not private.is_studio_admin(new.studio_id) then raise exception 'Only an active studio administrator may manage events'; end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from (select auth.uid()) or new.organizer_id is distinct from (select auth.uid()) then raise exception 'Event organizer must be the authenticated administrator'; end if;
    if new.cancelled_at is not null then raise exception 'New events cannot start cancelled'; end if;
  else
    if old.cancelled_at is not null then raise exception 'Cancelled events are read-only'; end if;
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id or new.created_by is distinct from old.created_by or new.organizer_id is distinct from old.organizer_id or new.created_at is distinct from old.created_at then raise exception 'Event ownership fields cannot be changed'; end if;
    if new.cancelled_at is not null and (new.title is distinct from old.title or new.project_id is distinct from old.project_id or new.event_type is distinct from old.event_type or new.description is distinct from old.description or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url) then raise exception 'Cancelling an event cannot change event details'; end if;
    if new.cancelled_at is not null then return new; end if;
  end if;
  if new.project_id is not null then
    select studio_id, status into project_studio_id, project_status from public.projects where id = new.project_id;
    if project_studio_id is distinct from new.studio_id then raise exception 'Event project must belong to the same studio'; end if;
    if project_status not in ('planned', 'active', 'paused') then raise exception 'Events on completed or archived projects may only be cancelled'; end if;
  end if;
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
revoke execute on function private.validate_calendar_event_invite() from public, anon, authenticated;
create trigger validate_calendar_event_invite_before_write before insert or update or delete on public.calendar_event_invites for each row execute function private.validate_calendar_event_invite();

alter table public.calendar_event_invites enable row level security;
revoke all on public.calendar_event_invites from anon, authenticated;
grant select on public.calendar_event_invites to authenticated;
grant insert (event_id, user_id, invited_by), delete on public.calendar_event_invites to authenticated;
grant update (status, responded_at) on public.calendar_event_invites to authenticated;
create policy calendar_event_invites_select_visible on public.calendar_event_invites for select to authenticated using ((select private.can_view_calendar_event(event_id)));
create policy calendar_event_invites_insert_admin on public.calendar_event_invites for insert to authenticated with check ((select private.can_manage_calendar_event(event_id)));
create policy calendar_event_invites_delete_admin on public.calendar_event_invites for delete to authenticated using ((select private.can_manage_calendar_event(event_id)));
create policy calendar_event_invites_respond_own on public.calendar_event_invites for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert (organizer_id) on public.calendar_events to authenticated;

drop trigger if exists notify_calendar_attendee_after_insert on public.calendar_event_attendees;
create or replace function private.notify_calendar_event_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_row public.calendar_events%rowtype; project_name text; organizer_name text;
begin
  select * into event_row from public.calendar_events where id = new.event_id;
  select name into project_name from public.projects where id = event_row.project_id;
  select full_name into organizer_name from public.profiles where id = event_row.organizer_id;
  perform private.create_notification('calendar_event_invitation', event_row.studio_id, new.user_id, new.invited_by,
    event_row.title, 'Calendar event',
    '/calendar?event=' || event_row.id || '&date=' || (event_row.starts_at at time zone 'Europe/Kyiv')::date, 'calendar_event', event_row.id,
    jsonb_build_object('inviteId', new.id, 'eventTitle', event_row.title, 'startsAt', event_row.starts_at, 'projectName', project_name, 'location', event_row.location, 'organizerName', organizer_name));
  return new;
end;
$$;
revoke execute on function private.notify_calendar_event_invite() from public, anon, authenticated;
create trigger notify_calendar_event_invite_after_insert after insert on public.calendar_event_invites for each row execute function private.notify_calendar_event_invite();

create or replace function private.notify_calendar_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; actor uuid := (select auth.uid()); notification_kind public.notification_type;
begin
  if old.cancelled_at is null and new.cancelled_at is not null then notification_kind := 'calendar_event_cancelled';
  elsif new.cancelled_at is null and (new.title is distinct from old.title or new.event_type is distinct from old.event_type or new.project_id is distinct from old.project_id or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url or new.description is distinct from old.description) then notification_kind := 'calendar_event_updated';
  else return new; end if;
  for recipient in select invite.user_id from public.calendar_event_invites invite where invite.event_id = new.id and invite.user_id <> new.organizer_id loop
    perform private.create_notification(notification_kind, new.studio_id, recipient, actor, new.title, 'Calendar event',
      '/calendar?event=' || new.id || '&date=' || (new.starts_at at time zone 'Europe/Kyiv')::date, 'calendar_event', new.id,
      jsonb_build_object('eventTitle', new.title, 'startsAt', new.starts_at, 'projectId', new.project_id, 'location', new.location, 'organizerId', new.organizer_id));
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_calendar_event_change_after_update on public.calendar_events;
create trigger notify_calendar_event_change_after_update
after update on public.calendar_events
for each row execute function private.notify_calendar_event_change();
