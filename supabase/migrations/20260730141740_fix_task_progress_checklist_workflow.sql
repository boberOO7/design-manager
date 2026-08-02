-- Correct the already-applied task-progress milestone without recreating its
-- schema. The prior push failed before this migration began, so this is a pure
-- delta over the remote 20260730120100 state.

alter table public.task_checklist_items
  drop constraint if exists task_checklist_items_weight_check,
  add constraint task_checklist_items_weight_check
    check (weight > 0 and weight <= 1000 and trunc(weight) = weight);

create or replace function private.enforce_task_progress_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    -- This runs inside the task UPDATE transaction, while the existing checklist
    -- RLS/editor policy still evaluates the task's writable old status.
    update public.task_checklist_items
    set is_completed = true
    where task_id = old.id and not is_completed;
  elsif new.status = 'completed'
    and exists (
      select 1 from public.task_checklist_items as item
      where item.task_id = old.id and not item.is_completed
    ) then
    raise exception 'Complete every checklist item before moving this task to done';
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
