-- Calendar events belong to their organizer. Active studio administrators can
-- manage every event in their studio; active organizers can manage only their
-- own events. Invitation writes use the same decision through the helper.
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
      and private.is_studio_member(event.studio_id)
      and (private.is_studio_admin(event.studio_id) or event.organizer_id = (select auth.uid()))
      and event.cancelled_at is null
      and (event.project_id is null or project.status in ('planned', 'active', 'paused'))
  );
$$;

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
begin
  if tg_op = 'INSERT' then
    if not private.is_studio_member(new.studio_id) then
      raise exception 'Only an active studio member may create events';
    end if;
    if new.created_by is distinct from actor or new.organizer_id is distinct from actor then
      raise exception 'Event creator and organizer must be the authenticated user';
    end if;
    if new.cancelled_at is not null then
      raise exception 'New events cannot start cancelled';
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
    if new.cancelled_at is not null and (new.title is distinct from old.title or new.project_id is distinct from old.project_id or new.event_type is distinct from old.event_type or new.description is distinct from old.description or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url) then
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

create or replace function private.validate_calendar_event_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.calendar_events%rowtype;
  actor uuid := (select auth.uid());
begin
  select * into event_row from public.calendar_events where id = case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  if event_row.id is null or event_row.cancelled_at is not null then raise exception 'Event invitations are unavailable'; end if;
  if tg_op = 'INSERT' then
    if not private.can_manage_calendar_event(new.event_id) then raise exception 'Only the organizer or an active studio administrator may manage invitations'; end if;
    if new.user_id = event_row.organizer_id or new.invited_by is distinct from actor or new.status <> 'pending' or new.responded_at is not null then raise exception 'Invalid calendar invitation'; end if;
    if not exists (select 1 from public.studio_members member join public.profiles profile on profile.id = member.user_id where member.studio_id = event_row.studio_id and member.user_id = new.user_id and member.is_active and profile.is_active) then raise exception 'Invitee must be an active studio member'; end if;
    if event_row.project_id is not null and event_row.event_type not in ('meeting', 'client_presentation') and not exists (select 1 from public.project_members assignment where assignment.project_id = event_row.project_id and assignment.user_id = new.user_id and assignment.is_active) then raise exception 'Project event invitees must be active project members'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not private.can_manage_calendar_event(old.event_id) then raise exception 'Only the organizer or an active studio administrator may remove invitations'; end if;
    return old;
  end if;
  if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id or new.invited_by is distinct from old.invited_by or new.created_at is distinct from old.created_at then raise exception 'Invitation ownership fields cannot be changed'; end if;
  if actor is distinct from old.user_id or new.status not in ('accepted', 'declined') or new.status = old.status then raise exception 'Only the invited user may change their RSVP'; end if;
  new.responded_at := now();
  return new;
end;
$$;

drop policy if exists calendar_events_insert_admin on public.calendar_events;
create policy calendar_events_insert_organizer_or_admin
on public.calendar_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and organizer_id = (select auth.uid())
  and (select private.is_studio_member(studio_id))
  and (
    project_id is null
    or exists (
      select 1 from public.projects as project
      where project.id = calendar_events.project_id
        and project.studio_id = calendar_events.studio_id
        and project.status in ('planned', 'active', 'paused')
        and (select private.can_access_project(project.id))
    )
  )
);

drop policy if exists calendar_events_update_admin on public.calendar_events;
create policy calendar_events_update_organizer_or_admin
on public.calendar_events for update to authenticated
using ((select private.can_manage_calendar_event(id)))
with check (
  (select private.is_studio_member(studio_id))
  and (private.is_studio_admin(studio_id) or organizer_id = (select auth.uid()))
);

drop policy if exists calendar_event_invites_insert_admin on public.calendar_event_invites;
create policy calendar_event_invites_insert_organizer_or_admin
on public.calendar_event_invites for insert to authenticated
with check ((select private.can_manage_calendar_event(event_id)));

drop policy if exists calendar_event_invites_delete_admin on public.calendar_event_invites;
create policy calendar_event_invites_delete_organizer_or_admin
on public.calendar_event_invites for delete to authenticated
using ((select private.can_manage_calendar_event(event_id)));
