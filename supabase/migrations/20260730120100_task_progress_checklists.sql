alter table public.projects
  add column progress_method text not null default 'equal'
    check (progress_method in ('equal', 'area', 'weighted'));

alter table public.tasks
  add column production_completion numeric not null default 0
    check (production_completion >= 0 and production_completion <= 100),
  add column progress_weight numeric not null default 1
    check (progress_weight > 0 and progress_weight <= 1000);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  is_completed boolean not null default false,
  weight numeric not null default 1 check (weight > 0 and weight <= 1000),
  position integer not null check (position >= 0 and position <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, position)
);

create index idx_task_checklist_items_task_order
on public.task_checklist_items(task_id, position, id);

create or replace function private.assign_task_checklist_position()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.task_id::text, 0));
  select coalesce(max(item.position) + 1, 0) into new.position
  from public.task_checklist_items as item
  where item.task_id = new.task_id;
  return new;
end;
$$;

revoke execute on function private.assign_task_checklist_position()
from public, anon, authenticated;

create trigger assign_task_checklist_position_before_insert
before insert on public.task_checklist_items
for each row execute function private.assign_task_checklist_position();

create trigger set_task_checklist_items_updated_at
before update on public.task_checklist_items
for each row execute function public.set_updated_at();

alter table public.task_checklist_items enable row level security;

grant select, delete on table public.task_checklist_items to authenticated;
grant insert (task_id, title, is_completed, weight, position)
on table public.task_checklist_items to authenticated;
grant update (title, is_completed, weight)
on table public.task_checklist_items to authenticated;
grant update (progress_method) on table public.projects to authenticated;
grant update (production_completion, progress_weight) on table public.tasks to authenticated;

create policy "task_checklist_items_select_for_authorized_users"
on public.task_checklist_items
for select
to authenticated
using (
  exists (
    select 1 from public.tasks as task
    where task.id = task_id
      and (select private.can_access_project(task.project_id))
  )
);

create or replace function private.can_edit_task_checklist(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as task
    where task.id = target_task_id
      and task.status in ('todo', 'in_progress')
      and private.can_update_project_task_status(task.project_id, task.assignee_id)
  );
$$;

revoke execute on function private.can_edit_task_checklist(uuid) from public, anon;
grant execute on function private.can_edit_task_checklist(uuid) to authenticated;

create policy "task_checklist_items_insert_for_task_editors"
on public.task_checklist_items
for insert
to authenticated
with check ((select private.can_edit_task_checklist(task_id)));

create policy "task_checklist_items_update_for_task_editors"
on public.task_checklist_items
for update
to authenticated
using ((select private.can_edit_task_checklist(task_id)))
with check ((select private.can_edit_task_checklist(task_id)));

create policy "task_checklist_items_delete_for_task_editors"
on public.task_checklist_items
for delete
to authenticated
using ((select private.can_edit_task_checklist(task_id)));

create or replace function private.enforce_task_progress_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('review', 'completed')
    and exists (
      select 1 from public.task_checklist_items as item
      where item.task_id = old.id and not item.is_completed
    ) then
    raise exception 'Complete every checklist item before moving this task to client review or done';
  end if;

  if new.status in ('review', 'completed') then
    new.production_completion := 100;
  elsif new.production_completion is distinct from old.production_completion
    and new.status <> 'in_progress' then
    raise exception 'Manual production completion is editable only while a task is in progress';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_task_progress_workflow()
from public, anon, authenticated;

create trigger enforce_task_progress_workflow_before_update
before update on public.tasks
for each row execute function private.enforce_task_progress_workflow();

create or replace function private.enforce_task_edit_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_status text;
  task_studio_id uuid;
  is_admin boolean;
begin
  select project.status, project.studio_id into project_status, task_studio_id
  from public.projects as project where project.id = old.project_id;

  if project_status is null or project_status = 'archived' then
    raise exception 'Archived projects are read-only';
  end if;
  if project_status = 'completed' then
    raise exception 'Completed projects are read-only until reopened';
  end if;

  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  if new.project_id is distinct from old.project_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.start_date is distinct from old.start_date then
    raise exception 'Task field is not editable';
  end if;
  if not is_admin and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.completed_area_m2 is distinct from old.completed_area_m2
    or new.progress_weight is distinct from old.progress_weight
  ) then
    raise exception 'Only administrators may edit task details';
  end if;
  if is_admin and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_task_edit_permissions()
from public, anon, authenticated;

drop policy if exists "tasks_update_status_for_admins_and_assignees" on public.tasks;
create policy "tasks_update_status_for_admins_and_assignees"
on public.tasks for update to authenticated
using ((select private.can_update_project_task_status(project_id, assignee_id)))
with check (
  (select private.can_update_project_task_status(project_id, assignee_id))
  and status in ('todo', 'in_progress', 'review', 'completed')
);

create or replace function private.validate_task_area_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_project_id uuid;
  affected_project_id uuid;
  method text;
  scope_area numeric;
  allocated_area numeric;
begin
  if tg_op = 'UPDATE' then
    old_project_id := old.project_id;
  end if;

  -- Every write that can change allocated area uses the same transaction-scoped
  -- project lock. Project moves lock both projects in UUID order to avoid a
  -- cross-project deadlock while keeping unrelated projects concurrent.
  for affected_project_id in
    select distinct affected.project_id
    from (values (new.project_id), (old_project_id)) as affected(project_id)
    where affected.project_id is not null
    order by affected.project_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('studioflow:task-area:' || affected_project_id::text, 0)
    );
  end loop;

  for affected_project_id in
    select distinct affected.project_id
    from (values (new.project_id), (old_project_id)) as affected(project_id)
    where affected.project_id is not null
    order by affected.project_id
  loop
    select project.progress_method, project.total_area_m2 into method, scope_area
    from public.projects as project
    where project.id = affected_project_id;

    if method = 'area' then
      if scope_area is null or scope_area <= 0 then
        raise exception 'Area progress requires a positive project design-scope area';
      end if;

      select coalesce(sum(task.completed_area_m2), 0) into allocated_area
      from public.tasks as task
      where task.project_id = affected_project_id
        and task.id is distinct from new.id
        and task.status <> 'cancelled'
        and task.completed_area_m2 is not null;

      if affected_project_id = new.project_id and new.status <> 'cancelled' then
        allocated_area := allocated_area + coalesce(new.completed_area_m2, 0);
      end if;
      if allocated_area > scope_area then
        raise exception 'Task area allocation cannot exceed the project design-scope area';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function private.validate_task_area_allocation()
from public, anon, authenticated;

create trigger validate_task_area_allocation_before_write
before insert or update of project_id, status, completed_area_m2 on public.tasks
for each row execute function private.validate_task_area_allocation();

create or replace function private.validate_project_progress_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_project_id uuid;
  allocated_area numeric;
begin
  -- Use the same lock namespace as task-area writes. Acquiring affected project
  -- locks in UUID order also keeps this safe if project identifiers ever become
  -- movable through a privileged maintenance path.
  for affected_project_id in
    select distinct affected.project_id
    from (values (new.id), (old.id)) as affected(project_id)
    where affected.project_id is not null
    order by affected.project_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('studioflow:task-area:' || affected_project_id::text, 0)
    );
  end loop;

  if new.progress_method = 'area' then
    if new.total_area_m2 is null or new.total_area_m2 <= 0 then
      raise exception 'Area progress requires a positive project design-scope area';
    end if;
    select coalesce(sum(task.completed_area_m2), 0) into allocated_area
    from public.tasks as task
    where task.project_id = new.id
      and task.status <> 'cancelled'
      and task.completed_area_m2 is not null;
    if allocated_area > new.total_area_m2 then
      raise exception 'Task area allocation cannot exceed the project design-scope area';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_project_progress_settings()
from public, anon, authenticated;

create trigger validate_project_progress_settings_before_update
before update of progress_method, total_area_m2 on public.projects
for each row execute function private.validate_project_progress_settings();
