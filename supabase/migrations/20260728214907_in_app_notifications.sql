create type public.notification_type as enum (
  'time_off_request_submitted',
  'time_off_request_approved',
  'time_off_request_rejected',
  'time_off_request_cancelled',
  'task_assigned',
  'task_details_changed',
  'calendar_event_invitation',
  'calendar_event_updated',
  'calendar_event_cancelled'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type public.notification_type not null,
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 500),
  href text not null check (href ~ '^/[^/].*'),
  entity_type text check (entity_type is null or length(entity_type) <= 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_created_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_studio_idx on public.notifications (studio_id);
create index notifications_entity_idx on public.notifications (entity_type, entity_id)
  where entity_id is not null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select (id, studio_id, recipient_id, actor_id, notification_type, title, body, href, entity_type, entity_id, metadata, read_at, created_at)
  on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "notifications_select_for_recipient"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));

create policy "notifications_mark_read_for_recipient"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function private.enforce_notification_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.studio_id is distinct from old.studio_id
    or new.recipient_id is distinct from old.recipient_id
    or new.actor_id is distinct from old.actor_id
    or new.notification_type is distinct from old.notification_type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.metadata is distinct from old.metadata
    or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state may be changed';
  end if;

  if old.read_at is not null or new.read_at is null then
    raise exception 'Notifications cannot be marked unread';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_notification_read_only() from public, anon, authenticated;

create trigger enforce_notification_read_only_before_update
before update on public.notifications
for each row execute function private.enforce_notification_read_only();

create or replace function private.create_notification(
  p_notification_type public.notification_type,
  p_studio_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then return; end if;
  if p_title is null or length(btrim(p_title)) = 0
    or p_body is null or length(btrim(p_body)) = 0
    or p_href !~ '^/[^/].*' then
    raise exception 'Invalid generated notification';
  end if;
  if not exists (
    select 1
    from public.studio_members as member
    inner join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = p_studio_id
      and member.user_id = p_recipient_id
      and member.is_active
      and profile.is_active
  ) then
    return;
  end if;
  insert into public.notifications (
    studio_id, recipient_id, actor_id, notification_type, title, body, href,
    entity_type, entity_id, metadata
  ) values (
    p_studio_id, p_recipient_id, p_actor_id, p_notification_type, p_title, p_body,
    left(p_title, 160), left(p_body, 500), p_href, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;
revoke execute on function private.create_notification(public.notification_type, uuid, uuid, uuid, text, text, text, text, uuid, jsonb)
from public, anon, authenticated;

create or replace function private.notify_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  recipient uuid;
  request_label text := initcap(replace(new.request_type::text, '_', ' '));
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    actor := (select auth.uid());
    for recipient in
      select distinct member.user_id
      from public.studio_members as member
      inner join public.profiles as profile on profile.id = member.user_id
      where member.studio_id = new.studio_id and member.is_active and profile.is_active
        and member.system_role = 'admin'
    loop
      perform private.create_notification(
        'time_off_request_submitted', new.studio_id, recipient, actor,
        'New time-off request',
        (select profile.full_name from public.profiles as profile where profile.id = new.user_id)
          || ' requested ' || request_label || ' for ' || to_char(new.start_date, 'Mon FMDD')
          || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
        '/admin?request=' || new.id, 'time_off_request', new.id, '{}'::jsonb
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    actor := new.reviewed_by;
    perform private.create_notification(
      case when new.status = 'approved' then 'time_off_request_approved' else 'time_off_request_rejected' end,
      new.studio_id, new.user_id, actor,
      case when new.status = 'approved' then 'Time off approved' else 'Time off rejected' end,
      request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD')
        || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request', new.id, '{}'::jsonb
    );
  elsif tg_op = 'UPDATE' and old.status in ('approved', 'rejected') and new.status = 'cancelled' then
    actor := (select auth.uid());
    perform private.create_notification(
      'time_off_request_cancelled', new.studio_id, new.user_id, actor,
      'Time off cancelled', request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD') || ' was cancelled.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request', new.id, '{}'::jsonb
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_time_off_request() from public, anon, authenticated;
create trigger notify_time_off_request_after_write
after insert or update on public.time_off_requests
for each row execute function private.notify_time_off_request();

create or replace function private.notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  project_studio_id uuid;
  project_name text;
  change_label text;
begin
  select project.name, project.studio_id into project_name, project_studio_id
  from public.projects as project where project.id = new.project_id;
  if tg_op = 'INSERT' then
    perform private.create_notification('task_assigned', project_studio_id, new.assignee_id, actor,
      'New task assigned', 'You were assigned “' || new.title || '” in ' || project_name || '.',
      '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
    perform private.create_notification('task_assigned', project_studio_id, new.assignee_id, actor,
      'New task assigned', 'You were assigned “' || new.title || '” in ' || project_name || '.',
      '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and new.assignee_id is distinct from actor
    and (new.due_date is distinct from old.due_date or new.priority is distinct from old.priority) then
    change_label := case when new.due_date is distinct from old.due_date and new.priority is distinct from old.priority then 'Priority and due date changed for “' || new.title || '”.'
      when new.due_date is distinct from old.due_date then 'The due date for “' || new.title || '” changed' || case when new.due_date is null then '.' else ' to ' || to_char(new.due_date, 'Mon FMDD') || '.' end
      else 'Priority changed for “' || new.title || '”.' end;
    perform private.create_notification('task_details_changed', project_studio_id, new.assignee_id, actor,
      'Task details changed', change_label, '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_task_change() from public, anon, authenticated;
create trigger notify_task_change_after_write
after insert or update on public.tasks
for each row execute function private.notify_task_change();

create or replace function private.notify_calendar_attendee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_row public.calendar_events%rowtype; actor uuid := (select auth.uid());
begin
  select * into event_row from public.calendar_events where id = new.event_id;
  perform private.create_notification('calendar_event_invitation', event_row.studio_id, new.user_id, actor,
    'New calendar invitation', 'You were added to “' || event_row.title || '” on ' || to_char(event_row.starts_at at time zone 'Europe/Kyiv', 'Mon FMDD') || '.',
    '/calendar?event=' || event_row.id || '&date=' || (event_row.starts_at at time zone 'Europe/Kyiv')::date,
    'calendar_event', event_row.id, '{}'::jsonb);
  return new;
end;
$$;
revoke execute on function private.notify_calendar_attendee() from public, anon, authenticated;
create trigger notify_calendar_attendee_after_insert
after insert on public.calendar_event_attendees
for each row execute function private.notify_calendar_attendee();

create or replace function private.notify_calendar_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid; actor uuid := (select auth.uid()); notification_kind public.notification_type; notification_title text; notification_body text;
begin
  if old.cancelled_at is null and new.cancelled_at is not null then
    notification_kind := 'calendar_event_cancelled'; notification_title := 'Calendar event cancelled'; notification_body := '“' || old.title || '” on ' || to_char(old.starts_at at time zone 'Europe/Kyiv', 'Mon FMDD') || ' was cancelled.';
  elsif new.cancelled_at is null and (new.title is distinct from old.title or new.event_type is distinct from old.event_type or new.project_id is distinct from old.project_id or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day or new.location is distinct from old.location or new.meeting_url is distinct from old.meeting_url) then
    notification_kind := 'calendar_event_updated'; notification_title := 'Calendar event updated'; notification_body := '“' || new.title || '” was updated.';
  else return new; end if;
  for recipient in
    select distinct attendee.user_id
    from public.calendar_event_attendees as attendee
    inner join public.studio_members as member
      on member.studio_id = new.studio_id and member.user_id = attendee.user_id and member.is_active
    inner join public.profiles as profile on profile.id = attendee.user_id and profile.is_active
    where attendee.event_id = new.id
  loop
    perform private.create_notification(notification_kind, new.studio_id, recipient, actor, notification_title, notification_body,
      '/calendar?event=' || new.id || '&date=' || (new.starts_at at time zone 'Europe/Kyiv')::date, 'calendar_event', new.id, '{}'::jsonb);
  end loop;
  return new;
end;
$$;
revoke execute on function private.notify_calendar_event_change() from public, anon, authenticated;
create trigger notify_calendar_event_change_after_update
after update on public.calendar_events
for each row execute function private.notify_calendar_event_change();
