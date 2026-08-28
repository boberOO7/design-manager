alter type public.calendar_event_type add value if not exists 'interview';

-- Interviews use the same studio-wide guest list as meetings, even when a
-- project is associated with the event.
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
    if event_row.project_id is not null and event_row.event_type not in ('meeting', 'client_presentation', 'interview') and not exists (select 1 from public.project_members assignment where assignment.project_id = event_row.project_id and assignment.user_id = new.user_id and assignment.is_active) then raise exception 'Project event invitees must be active project members'; end if;
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
