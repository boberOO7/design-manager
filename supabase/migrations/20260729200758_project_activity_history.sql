-- Activity History begins at this migration. Existing source records are not backfilled.
alter table public.project_activity
  rename column action to action_type;

alter table public.project_activity
  rename column metadata to changes;

alter table public.project_activity
  add column studio_id uuid references public.studios(id);

update public.project_activity as activity
set studio_id = project.studio_id
from public.projects as project
where project.id = activity.project_id;

alter table public.project_activity
  alter column studio_id set not null,
  alter column actor_id drop not null,
  alter column entity_id type uuid using entity_id::uuid;

alter table public.project_activity
  add constraint project_activity_action_type_check check (action_type in (
    'project_lifecycle_changed', 'project_archived', 'project_restored',
    'project_updated', 'task_created', 'task_updated',
    'project_member_added', 'project_member_removed', 'project_member_updated'
  )),
  add constraint project_activity_entity_type_check check (entity_type in ('project', 'task', 'project_member'));

create index project_activity_project_created_at_idx
  on public.project_activity (project_id, created_at desc, id desc);

alter table public.project_activity enable row level security;

drop policy if exists "project_activity_select_for_authorized_users" on public.project_activity;
create policy "project_activity_select_for_authorized_project_users"
on public.project_activity
for select
to authenticated
using ((select private.can_access_project(project_id)));

revoke all on table public.project_activity from anon, authenticated;
grant select on table public.project_activity to authenticated;

create or replace function private.record_project_activity(
  target_studio_id uuid,
  target_project_id uuid,
  target_action_type text,
  target_entity_type text,
  target_entity_id uuid,
  target_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_activity (
    studio_id, project_id, actor_id, action_type, entity_type, entity_id, changes
  ) values (
    target_studio_id, target_project_id, (select auth.uid()), target_action_type,
    target_entity_type, target_entity_id, target_changes
  );
end;
$$;

revoke execute on function private.record_project_activity(uuid, uuid, text, text, uuid, jsonb)
from public, anon, authenticated;

create or replace function private.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_changes jsonb := '{}'::jsonb;
  activity_action text;
begin
  if new.status is distinct from old.status then
    activity_changes := activity_changes || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.priority is distinct from old.priority then
    activity_changes := activity_changes || jsonb_build_object('priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.due_date is distinct from old.due_date then
    activity_changes := activity_changes || jsonb_build_object('due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.archived_at is distinct from old.archived_at then
    activity_changes := activity_changes || jsonb_build_object('archived_at', jsonb_build_object('from', old.archived_at, 'to', new.archived_at));
  end if;
  if activity_changes = '{}'::jsonb then return new; end if;

  activity_action := case
    when new.status = 'archived' then 'project_archived'
    when old.status = 'archived' then 'project_restored'
    when new.status is distinct from old.status then 'project_lifecycle_changed'
    else 'project_updated'
  end;
  perform private.record_project_activity(new.studio_id, new.id, activity_action, 'project', new.id, activity_changes);
  return new;
end;
$$;

revoke execute on function private.log_project_activity() from public, anon, authenticated;
create trigger log_project_activity_after_update
after update on public.projects
for each row execute function private.log_project_activity();

create or replace function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_studio_id uuid;
  activity_changes jsonb := '{}'::jsonb;
begin
  select studio_id into project_studio_id from public.projects where id = coalesce(new.project_id, old.project_id);
  if tg_op = 'INSERT' then
    perform private.record_project_activity(project_studio_id, new.project_id, 'task_created', 'task', new.id,
      jsonb_strip_nulls(jsonb_build_object('status', new.status, 'priority', new.priority, 'assignee_id', new.assignee_id, 'due_date', new.due_date)));
    return new;
  end if;
  if new.status is distinct from old.status then activity_changes := activity_changes || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)); end if;
  if new.assignee_id is distinct from old.assignee_id then activity_changes := activity_changes || jsonb_build_object('assignee_id', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id)); end if;
  if new.priority is distinct from old.priority then activity_changes := activity_changes || jsonb_build_object('priority', jsonb_build_object('from', old.priority, 'to', new.priority)); end if;
  if new.due_date is distinct from old.due_date then activity_changes := activity_changes || jsonb_build_object('due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date)); end if;
  if activity_changes <> '{}'::jsonb then
    perform private.record_project_activity(project_studio_id, new.project_id, 'task_updated', 'task', new.id, activity_changes);
  end if;
  return new;
end;
$$;

revoke execute on function private.log_task_activity() from public, anon, authenticated;
create trigger log_task_activity_after_insert_or_update
after insert or update on public.tasks
for each row execute function private.log_task_activity();

create or replace function private.log_project_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.record_project_activity((select studio_id from public.projects where id = new.project_id), new.project_id, 'project_member_added', 'project_member', new.id,
      jsonb_build_object('member_id', new.user_id, 'project_role', new.project_role, 'assigned_area_m2', new.assigned_area_m2));
    return new;
  elsif tg_op = 'DELETE' then
    perform private.record_project_activity((select studio_id from public.projects where id = old.project_id), old.project_id, 'project_member_removed', 'project_member', old.id,
      jsonb_build_object('member_id', old.user_id));
    return old;
  end if;
  if new.is_active is distinct from old.is_active then activity_changes := activity_changes || jsonb_build_object('is_active', jsonb_build_object('from', old.is_active, 'to', new.is_active)); end if;
  if new.project_role is distinct from old.project_role then activity_changes := activity_changes || jsonb_build_object('project_role', jsonb_build_object('from', old.project_role, 'to', new.project_role)); end if;
  if new.assigned_area_m2 is distinct from old.assigned_area_m2 then activity_changes := activity_changes || jsonb_build_object('assigned_area_m2', jsonb_build_object('from', old.assigned_area_m2, 'to', new.assigned_area_m2)); end if;
  if activity_changes <> '{}'::jsonb then
    perform private.record_project_activity((select studio_id from public.projects where id = new.project_id), new.project_id,
      case when new.is_active = false and old.is_active = true then 'project_member_removed' else 'project_member_updated' end,
      'project_member', new.id, activity_changes || jsonb_build_object('member_id', new.user_id));
  end if;
  return new;
end;
$$;

revoke execute on function private.log_project_member_activity() from public, anon, authenticated;
create trigger log_project_member_activity_after_change
after insert or update or delete on public.project_members
for each row execute function private.log_project_member_activity();
