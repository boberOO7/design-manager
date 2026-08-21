alter table public.project_task_stage_columns
  add column progress_method text not null default 'equal'
    check (progress_method in ('equal', 'area', 'weighted'));

update public.project_task_stage_columns as stage_columns
set progress_method = projects.progress_method
from public.projects
where projects.id = stage_columns.project_id;

create or replace function private.create_project_task_stage_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_task_stage_columns (project_id, stage)
  values (new.id, 'stage_1'), (new.id, 'stage_2'), (new.id, 'stage_3'), (new.id, 'stage_4');
  return new;
end;
$$;
revoke execute on function private.create_project_task_stage_columns() from public, anon, authenticated;

create or replace function private.validate_stage_progress_method()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  scope_area numeric;
  allocated_area numeric;
begin
  if new.progress_method <> 'area' then return new; end if;
  select total_area_m2 into scope_area from public.projects where id = new.project_id;
  if scope_area is null or scope_area <= 0 then
    raise exception 'Area progress requires a positive project design-scope area';
  end if;
  select coalesce(sum(task.completed_area_m2), 0) into allocated_area
  from public.tasks as task
  where task.project_id = new.project_id
    and task.stage = new.stage
    and task.status <> 'cancelled'
    and task.completed_area_m2 is not null;
  if allocated_area > scope_area then
    raise exception 'Task area allocation cannot exceed the project design-scope area';
  end if;
  return new;
end;
$$;
revoke execute on function private.validate_stage_progress_method() from public, anon, authenticated;

create trigger validate_stage_progress_method_before_update
before update of progress_method on public.project_task_stage_columns
for each row execute function private.validate_stage_progress_method();

drop trigger if exists validate_task_area_allocation_before_write on public.tasks;
drop function if exists private.validate_task_area_allocation();
create or replace function private.validate_task_stage_area_allocation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  affected_project_id uuid;
  old_project_id uuid;
  scope_area numeric;
  allocated_area numeric;
begin
  if tg_op = 'UPDATE' then old_project_id := old.project_id; end if;
  for affected_project_id in
    select distinct affected.project_id
    from (values (new.project_id), (old_project_id)) as affected(project_id)
    where affected.project_id is not null
    order by affected.project_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:task-area:' || affected_project_id::text, 0));
    if exists (select 1 from public.project_task_stage_columns where project_id = affected_project_id and progress_method = 'area') then
      select total_area_m2 into scope_area from public.projects where id = affected_project_id;
      select coalesce(sum(task.completed_area_m2), 0) into allocated_area
      from public.tasks as task
      join public.project_task_stage_columns as stage_columns
        on stage_columns.project_id = task.project_id
       and stage_columns.stage = task.stage
      where task.project_id = affected_project_id
        and task.status <> 'cancelled'
        and stage_columns.progress_method = 'area'
        and task.completed_area_m2 is not null
        and task.id is distinct from new.id;
      if affected_project_id = new.project_id
        and new.status <> 'cancelled'
        and exists (select 1 from public.project_task_stage_columns where project_id = new.project_id and stage = new.stage and progress_method = 'area') then
        allocated_area := allocated_area + coalesce(new.completed_area_m2, 0);
      end if;
      if scope_area is null or scope_area <= 0 then raise exception 'Area progress requires a positive project design-scope area'; end if;
      if allocated_area > scope_area then raise exception 'Task area allocation cannot exceed the project design-scope area'; end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function private.validate_task_stage_area_allocation() from public, anon, authenticated;
create trigger validate_task_stage_area_allocation_before_write
before insert or update of project_id, stage, status, completed_area_m2 on public.tasks
for each row execute function private.validate_task_stage_area_allocation();

drop trigger if exists validate_project_progress_settings_before_update on public.projects;
drop function if exists private.validate_project_progress_settings();
alter table public.projects drop column progress_method;
