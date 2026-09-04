create type public.office_assignment_status as enum ('assigned', 'in_progress', 'done', 'cancelled');

alter type public.notification_type add value if not exists 'office_assignment_assigned';
alter type public.notification_type add value if not exists 'office_assignment_status_changed';

create table public.office_assignments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text check (description is null or length(description) <= 5000),
  creator_id uuid not null,
  responsible_id uuid not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  deadline date,
  status public.office_assignment_status not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (studio_id, creator_id) references public.studio_members(studio_id, user_id),
  foreign key (studio_id, responsible_id) references public.studio_members(studio_id, user_id)
);

create index office_assignments_studio_created_idx on public.office_assignments(studio_id, created_at desc);
create index office_assignments_responsible_status_idx on public.office_assignments(responsible_id, status, deadline);

create trigger set_office_assignments_updated_at before update on public.office_assignments
for each row execute function public.set_updated_at();

create or replace function private.office_assignment_transition_is_valid(
  p_old public.office_assignment_status,
  p_new public.office_assignment_status
) returns boolean language sql immutable set search_path = '' as $$
  select p_old = p_new or (p_old, p_new) in (
    ('assigned', 'in_progress'),
    ('in_progress', 'done'),
    ('assigned', 'cancelled'),
    ('in_progress', 'cancelled')
  );
$$;
revoke execute on function private.office_assignment_transition_is_valid(public.office_assignment_status, public.office_assignment_status) from public, anon, authenticated;

create or replace function private.enforce_office_assignment_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id
      or new.title is distinct from old.title or new.description is distinct from old.description
      or new.creator_id is distinct from old.creator_id or new.created_at is distinct from old.created_at then
      raise exception 'office_assignment_identity_is_immutable';
    end if;
    if not private.office_assignment_transition_is_valid(old.status, new.status) then
      raise exception 'invalid_office_assignment_transition';
    end if;
  end if;
  if not exists (
    select 1 from public.studio_members member
    join public.profiles profile on profile.id = member.user_id
    where member.studio_id = new.studio_id and member.user_id = new.responsible_id
      and member.is_active and profile.is_active
  ) then
    raise exception 'responsible_must_be_active_studio_member';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_office_assignment_write() from public, anon, authenticated;
create trigger enforce_office_assignment_write_before_write before insert or update on public.office_assignments
for each row execute function private.enforce_office_assignment_write();

alter table public.office_assignments enable row level security;
revoke all on table public.office_assignments from anon, authenticated;
grant select on table public.office_assignments to authenticated;

create policy office_assignments_select_authorized on public.office_assignments
for select to authenticated
using (
  (select private.is_studio_admin(studio_id))
  or (
    responsible_id = (select auth.uid())
    and (select private.is_studio_member(studio_id))
  )
);

create or replace function public.create_office_assignment(
  p_title text,
  p_description text,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_studio_id uuid; v_id uuid;
begin
  select member.studio_id into v_studio_id
  from public.studio_members member
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = v_actor and member.system_role = 'admin'
    and member.is_active and profile.is_active;
  if v_studio_id is null then raise exception 'admin_required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  insert into public.office_assignments(studio_id, title, description, creator_id, responsible_id, priority, deadline)
  values (v_studio_id, btrim(p_title), nullif(btrim(p_description), ''), v_actor, p_responsible_id, p_priority, p_deadline)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_office_assignment(text, text, uuid, text, date) from public, anon;
grant execute on function public.create_office_assignment(text, text, uuid, text, date) to authenticated;

create or replace function public.transition_office_assignment(
  p_assignment_id uuid,
  p_status public.office_assignment_status
) returns void language plpgsql security definer set search_path = '' as $$
declare v_assignment public.office_assignments; v_actor uuid := (select auth.uid());
begin
  select * into v_assignment from public.office_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'office_assignment_not_found'; end if;
  if not private.is_studio_admin(v_assignment.studio_id) and not (
    v_assignment.responsible_id = v_actor and private.is_studio_member(v_assignment.studio_id)
  ) then raise exception 'office_assignment_access_denied'; end if;
  if p_status = 'cancelled' and not private.is_studio_admin(v_assignment.studio_id) then
    raise exception 'admin_required_to_cancel';
  end if;
  update public.office_assignments set status = p_status where id = p_assignment_id;
end;
$$;
revoke all on function public.transition_office_assignment(uuid, public.office_assignment_status) from public, anon;
grant execute on function public.transition_office_assignment(uuid, public.office_assignment_status) to authenticated;

create or replace function public.manage_office_assignment(
  p_assignment_id uuid,
  p_status public.office_assignment_status,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date
) returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.office_assignments where id = p_assignment_id for update;
  if v_studio_id is null or not private.is_studio_admin(v_studio_id) then raise exception 'admin_required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  update public.office_assignments set status = p_status, responsible_id = p_responsible_id,
    priority = p_priority, deadline = p_deadline where id = p_assignment_id;
end;
$$;
revoke all on function public.manage_office_assignment(uuid, public.office_assignment_status, uuid, text, date) from public, anon;
grant execute on function public.manage_office_assignment(uuid, public.office_assignment_status, uuid, text, date) to authenticated;

create or replace function private.notify_office_assignment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, new.creator_id,
      'New office assignment', 'You are responsible for “' || new.title || '”.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('status', new.status, 'priority', new.priority));
  elsif new.status is distinct from old.status then
    perform private.create_notification('office_assignment_status_changed', new.studio_id, new.creator_id, actor,
      'Office assignment updated', '“' || new.title || '” is now ' || replace(new.status::text, '_', ' ') || '.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('status', new.status));
    if new.responsible_id is distinct from old.responsible_id then
      perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, actor,
        'New office assignment', 'You are responsible for “' || new.title || '”.',
        '/office/assignments?item=' || new.id, 'office_assignment', new.id,
        jsonb_build_object('status', new.status, 'priority', new.priority));
    end if;
  elsif new.responsible_id is distinct from old.responsible_id then
    perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, actor,
      'New office assignment', 'You are responsible for “' || new.title || '”.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('status', new.status, 'priority', new.priority));
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_office_assignment_change() from public, anon, authenticated;
create trigger notify_office_assignment_change_after_write after insert or update on public.office_assignments
for each row execute function private.notify_office_assignment_change();

-- Existing submission notifications now point at their canonical Office home.
create or replace function private.notify_submission_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; actor uuid := (select auth.uid()); author_label text;
begin
  if tg_op = 'INSERT' and new.type in ('request', 'complaint') then
    author_label := case when new.is_anonymous then 'Anonymous' else coalesce((select full_name from public.profiles where id = new.author_id), 'A studio member') end;
    for recipient in select member.user_id from public.studio_members member join public.profiles profile on profile.id = member.user_id
      where member.studio_id = new.studio_id and member.system_role = 'admin' and member.is_active and profile.is_active
    loop
      perform private.create_notification('submission_created', new.studio_id, recipient,
        case when new.is_anonymous then null else new.author_id end,
        case when new.type = 'request' then 'New request' else 'New complaint' end,
        author_label || ': “' || new.title || '”', '/office/submissions?item=' || new.id,
        'submission', new.id, jsonb_build_object('type', new.type, 'anonymous', new.is_anonymous));
    end loop;
  elsif tg_op = 'UPDATE' then
    if new.responsible_id is distinct from old.responsible_id and new.responsible_id is not null then
      perform private.create_notification('submission_assigned', new.studio_id, new.responsible_id, actor,
        'New request assigned', 'You are responsible for “' || new.title || '”.',
        '/office/submissions?item=' || new.id, 'submission', new.id, jsonb_build_object('type', new.type));
    end if;
    if new.status is distinct from old.status and new.author_id is not null then
      perform private.create_notification('submission_status_changed', new.studio_id, new.author_id, actor,
        'Submission updated', '“' || new.title || '” is now ' || replace(new.status::text, '_', ' ') || '.',
        '/office/submissions?item=' || new.id, 'submission', new.id, jsonb_build_object('type', new.type, 'status', new.status));
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_submission_change() from public, anon, authenticated;
