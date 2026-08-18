create or replace function private.are_distinct_text_array(p_values text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(p_values) = (select count(distinct item) from unnest(p_values) as entry(item));
$$;
revoke execute on function private.are_distinct_text_array(text[]) from public, anon, authenticated;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('todo', 'in_progress', 'internal_review', 'review', 'completed', 'cancelled'));

drop policy if exists "tasks_update_status_for_admins_and_assignees" on public.tasks;
create policy "tasks_update_status_for_admins_and_assignees" on public.tasks for update to authenticated
using ((select private.can_update_project_task_status(project_id, assignee_id)))
with check ((select private.can_update_project_task_status(project_id, assignee_id)) and status in ('todo', 'in_progress', 'internal_review', 'review', 'completed'));

create table public.project_task_stage_columns (
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null check (stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4')),
  enabled_statuses text[] not null default array['todo', 'in_progress', 'review', 'completed']::text[],
  updated_at timestamptz not null default now(),
  primary key (project_id, stage),
  check (cardinality(enabled_statuses) between 1 and 5),
  check (enabled_statuses <@ array['todo', 'in_progress', 'internal_review', 'review', 'completed']::text[]),
  check (private.are_distinct_text_array(enabled_statuses))
);

insert into public.project_task_stage_columns (project_id, stage)
select project.id, stage.stage
from public.projects project
cross join (values ('stage_1'), ('stage_2'), ('stage_3'), ('stage_4')) as stage(stage)
on conflict do nothing;

create or replace function private.create_project_task_stage_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_task_stage_columns (project_id, stage)
  values (new.id, 'stage_1'), (new.id, 'stage_2'), (new.id, 'stage_3'), (new.id, 'stage_4');
  return new;
end;
$$;
revoke execute on function private.create_project_task_stage_columns() from public, anon, authenticated;
create trigger create_project_task_stage_columns_after_insert after insert on public.projects for each row execute function private.create_project_task_stage_columns();

alter table public.project_task_stage_columns enable row level security;
revoke all on table public.project_task_stage_columns from anon, authenticated;
grant select, update on table public.project_task_stage_columns to authenticated;
create policy "project_task_stage_columns_select" on public.project_task_stage_columns for select to authenticated using ((select private.can_access_project(project_id)));
create policy "project_task_stage_columns_update_admin" on public.project_task_stage_columns for update to authenticated using (exists (select 1 from public.projects where id = project_id and private.is_studio_admin(studio_id))) with check (exists (select 1 from public.projects where id = project_id and private.is_studio_admin(studio_id)));

create or replace function private.prevent_removing_active_task_stage_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
    from public.tasks
    where project_id = old.project_id
      and stage = old.stage
      and status <> 'cancelled'
      and not (status = any(new.enabled_statuses))
  ) then
    raise exception 'Cannot disable a stage column while tasks still use that status. Move those tasks first.';
  end if;
  return new;
end;
$$;
revoke execute on function private.prevent_removing_active_task_stage_columns() from public, anon, authenticated;
create trigger prevent_removing_active_task_stage_columns_before_update before update of enabled_statuses on public.project_task_stage_columns for each row execute function private.prevent_removing_active_task_stage_columns();

create or replace function private.validate_task_stage_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'cancelled' and not exists (
    select 1
    from public.project_task_stage_columns
    where project_id = new.project_id
      and stage = new.stage
      and new.status = any(enabled_statuses)
  ) then
    raise exception 'Task status is not enabled for this project stage';
  end if;
  return new;
end;
$$;
revoke execute on function private.validate_task_stage_status() from public, anon, authenticated;
create trigger validate_task_stage_status_before_write before insert or update of project_id, stage, status on public.tasks for each row execute function private.validate_task_stage_status();

create or replace function private.activate_planned_project_from_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status in ('in_progress', 'internal_review', 'review', 'completed') then
    update public.projects set status = 'active' where id = new.project_id and status = 'planned' and archived_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function private.activate_planned_project_from_task() from public, anon, authenticated;

create or replace function public.create_task_with_checklist(p_task jsonb, p_checklist_items jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_task_id uuid;
begin
  insert into public.tasks (project_id, title, description, priority, assignee_id, created_by, due_date, completed_area_m2, stage, status)
  values ((p_task ->> 'project_id')::uuid, p_task ->> 'title', nullif(p_task ->> 'description', ''), p_task ->> 'priority', (p_task ->> 'assignee_id')::uuid, auth.uid(), nullif(p_task ->> 'due_date', '')::date, nullif(p_task ->> 'completed_area_m2', '')::numeric, coalesce(nullif(p_task ->> 'stage', ''), 'stage_1'), coalesce(nullif(p_task ->> 'status', ''), 'todo')) returning id into new_task_id;
  insert into public.task_checklist_items (task_id, title, weight, position)
  select new_task_id, item.title, item.weight, 0 from (select value ->> 'title' as title, (value ->> 'weight')::numeric as weight, ordinality from jsonb_array_elements(p_checklist_items) with ordinality) as item
  where char_length(btrim(item.title)) between 1 and 200 and item.weight > 0 and item.weight <= 1000 and trunc(item.weight) = item.weight order by item.ordinality;
  if jsonb_array_length(p_checklist_items) <> (select count(*) from public.task_checklist_items where task_id = new_task_id) then raise exception 'Checklist items must have a title and a whole-number weight from 1 to 1000'; end if;
  return new_task_id;
end;
$$;
revoke execute on function public.create_task_with_checklist(jsonb, jsonb) from public, anon;
grant execute on function public.create_task_with_checklist(jsonb, jsonb) to authenticated;
