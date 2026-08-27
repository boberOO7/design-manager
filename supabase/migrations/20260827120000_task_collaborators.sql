-- Co-assignees are task participants. The existing tasks.assignee_id remains
-- the sole primary/responsible assignee and therefore the productivity source.

create table public.task_collaborators (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_collaborators_user_task_idx
  on public.task_collaborators (user_id, task_id);

alter table public.task_collaborators enable row level security;

revoke all on public.task_collaborators from anon, authenticated;
grant select, insert, delete on public.task_collaborators to authenticated;


create policy "task_collaborators_select_for_authorized_users"
on public.task_collaborators
for select
to authenticated
using (
  (
    select private.can_access_project(
      (
        select task.project_id
        from public.tasks as task
        where task.id = task_id
      )
    )
  )
);


create policy "task_collaborators_write_for_studio_admins"
on public.task_collaborators
for all
to authenticated
using (
  exists (
    select 1
    from public.tasks as task
    inner join public.projects as project
      on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
  )
)
with check (
  exists (
    select 1
    from public.tasks as task
    inner join public.projects as project
      on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
  )
);


create or replace function private.is_active_task_collaborator(
  target_project_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_project_task_assignee(
    target_project_id,
    target_user_id
  );
$$;

revoke execute
on function private.is_active_task_collaborator(uuid, uuid)
from public, anon, authenticated;


create or replace function private.validate_task_collaborator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  primary_assignee_id uuid;
begin
  select
    task.project_id,
    task.assignee_id
  into
    target_project_id,
    primary_assignee_id
  from public.tasks as task
  where task.id = new.task_id;

  if target_project_id is null then
    raise exception 'Task collaborator requires a task';
  end if;

  if new.user_id = primary_assignee_id then
    raise exception 'Primary assignee cannot also be a co-assignee';
  end if;

  if not private.is_active_task_collaborator(
    target_project_id,
    new.user_id
  ) then
    raise exception 'Task co-assignee must be an active project member';
  end if;

  return new;
end;
$$;

revoke execute
on function private.validate_task_collaborator()
from public, anon, authenticated;


create trigger validate_task_collaborator_before_write
before insert or update
on public.task_collaborators
for each row
execute function private.validate_task_collaborator();


create or replace function public.update_task_details_with_collaborators(
  p_task_id uuid,
  p_task jsonb,
  p_collaborator_ids uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_project_id uuid;
  task_studio_id uuid;
  requested_id uuid;
begin
  select
    task.project_id,
    project.studio_id
  into
    task_project_id,
    task_studio_id
  from public.tasks as task
  inner join public.projects as project
    on project.id = task.project_id
  where task.id = p_task_id;

  if task_project_id is null
     or not private.is_studio_admin(task_studio_id) then
    raise exception 'Only active studio administrators can edit task details';
  end if;

  if cardinality(p_collaborator_ids)
     <> cardinality(
       array(
         select distinct unnest(p_collaborator_ids)
       )
     ) then
    raise exception 'Task co-assignees must be unique';
  end if;

  foreach requested_id in array p_collaborator_ids loop
    if not private.is_active_task_collaborator(
      task_project_id,
      requested_id
    ) then
      raise exception 'Task co-assignee must be an active project member';
    end if;
  end loop;

  if nullif(p_task ->> 'assignee_id', '') is not null
     and nullif(p_task ->> 'assignee_id', '')::uuid = any(p_collaborator_ids) then
    p_collaborator_ids := array_remove(
      p_collaborator_ids,
      nullif(p_task ->> 'assignee_id', '')::uuid
    );
  end if;

  update public.tasks
  set
    title = p_task ->> 'title',
    description = nullif(p_task ->> 'description', ''),
    assignee_id = nullif(p_task ->> 'assignee_id', '')::uuid,
    priority = p_task ->> 'priority',
    due_date = nullif(p_task ->> 'due_date', '')::date,
    completed_area_m2 = nullif(
      p_task ->> 'completed_area_m2',
      ''
    )::numeric,
    progress_weight = (p_task ->> 'progress_weight')::numeric,
    stage = p_task ->> 'stage',
    status = p_task ->> 'status'
  where id = p_task_id;

  delete from public.task_collaborators
  where task_id = p_task_id
    and not (user_id = any(p_collaborator_ids));

  insert into public.task_collaborators (
    task_id,
    user_id
  )
  select
    p_task_id,
    unnest(p_collaborator_ids)
  on conflict (task_id, user_id) do nothing;
end;
$$;

revoke execute
on function public.update_task_details_with_collaborators(
  uuid,
  jsonb,
  uuid[]
)
from public, anon;

grant execute
on function public.update_task_details_with_collaborators(
  uuid,
  jsonb,
  uuid[]
)
to authenticated;


create or replace function public.get_personal_task_ids()
returns table (
  task_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select task.id
  from public.tasks as task
  where task.assignee_id = (select auth.uid())

  union

  select collaborator.task_id
  from public.task_collaborators as collaborator
  where collaborator.user_id = (select auth.uid());
$$;

revoke execute
on function public.get_personal_task_ids()
from public, anon;

grant execute
on function public.get_personal_task_ids()
to authenticated;


create or replace function private.notify_task_collaborator_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  task_title text;
  task_project_id uuid;
  project_name text;
  project_studio_id uuid;
begin
  select
    task.title,
    task.project_id,
    project.name,
    project.studio_id
  into
    task_title,
    task_project_id,
    project_name,
    project_studio_id
  from public.tasks as task
  inner join public.projects as project
    on project.id = task.project_id
  where task.id = new.task_id;

  perform private.create_notification(
    'task_assigned',
    project_studio_id,
    new.user_id,
    actor,
    'New task assigned',
    'You were added to “' || task_title || '” in ' || project_name || '.',
    '/projects/' || task_project_id || '?task=' || new.task_id,
    'task',
    new.task_id,
    '{}'::jsonb
  );

  return new;
end;
$$;

revoke execute
on function private.notify_task_collaborator_change()
from public, anon, authenticated;


create trigger notify_task_collaborator_after_insert
after insert
on public.task_collaborators
for each row
execute function private.notify_task_collaborator_change();


create or replace function private.notify_task_collaborators_of_details_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  recipient uuid;
  project_name text;
  project_studio_id uuid;
  change_label text;
begin
  if new.due_date is not distinct from old.due_date
     and new.priority is not distinct from old.priority then
    return new;
  end if;

  select
    project.name,
    project.studio_id
  into
    project_name,
    project_studio_id
  from public.projects as project
  where project.id = new.project_id;

  change_label :=
    case
      when new.due_date is distinct from old.due_date
           and new.priority is distinct from old.priority
        then
          'Priority and due date changed for “'
          || new.title
          || '”.'

      when new.due_date is distinct from old.due_date
        then
          'The due date for “'
          || new.title
          || '” changed'
          || case
               when new.due_date is null
                 then '.'
               else
                 ' to '
                 || to_char(new.due_date, 'Mon FMDD')
                 || '.'
             end

      else
        'Priority changed for “'
        || new.title
        || '”.'
    end;

  for recipient in
    select distinct collaborator.user_id
    from public.task_collaborators as collaborator
    where collaborator.task_id = new.id
  loop
    perform private.create_notification(
      'task_details_changed',
      project_studio_id,
      recipient,
      actor,
      'Task details changed',
      change_label,
      '/projects/' || new.project_id || '?task=' || new.id,
      'task',
      new.id,
      '{}'::jsonb
    );
  end loop;

  return new;
end;
$$;

revoke execute
on function private.notify_task_collaborators_of_details_change()
from public, anon, authenticated;


create trigger notify_task_collaborators_after_details_change
after update of due_date, priority
on public.tasks
for each row
execute function private.notify_task_collaborators_of_details_change();