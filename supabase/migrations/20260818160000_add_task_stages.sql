alter table public.tasks
  add column stage text not null default 'stage_1'
    check (stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4'));

create index idx_tasks_project_stage on public.tasks(project_id, stage);

grant insert (stage) on table public.tasks to authenticated;
grant update (stage) on table public.tasks to authenticated;

create or replace function public.create_task_with_checklist(
  p_task jsonb,
  p_checklist_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_task_id uuid;
begin
  insert into public.tasks (
    project_id, title, description, priority, assignee_id, created_by, due_date, completed_area_m2, stage
  ) values (
    (p_task ->> 'project_id')::uuid,
    p_task ->> 'title',
    nullif(p_task ->> 'description', ''),
    p_task ->> 'priority',
    (p_task ->> 'assignee_id')::uuid,
    auth.uid(),
    nullif(p_task ->> 'due_date', '')::date,
    nullif(p_task ->> 'completed_area_m2', '')::numeric,
    coalesce(nullif(p_task ->> 'stage', ''), 'stage_1')
  ) returning id into new_task_id;

  insert into public.task_checklist_items (task_id, title, weight, position)
  select new_task_id, item.title, item.weight, 0
  from (
    select value ->> 'title' as title,
      (value ->> 'weight')::numeric as weight,
      ordinality
    from jsonb_array_elements(p_checklist_items) with ordinality
  ) as item
  where char_length(btrim(item.title)) between 1 and 200
    and item.weight > 0
    and item.weight <= 1000
    and trunc(item.weight) = item.weight
  order by item.ordinality;

  if jsonb_array_length(p_checklist_items)
    <> (select count(*) from public.task_checklist_items where task_id = new_task_id) then
    raise exception 'Checklist items must have a title and a whole-number weight from 1 to 1000';
  end if;

  return new_task_id;
end;
$$;

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

  if project_status is null or project_status = 'archived' then raise exception 'Archived projects are read-only'; end if;
  if project_status = 'completed' then raise exception 'Completed projects are read-only until reopened'; end if;

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
    or new.stage is distinct from old.stage
  ) then raise exception 'Only administrators may edit task details'; end if;
  if is_admin and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;
  if is_admin and new.assignee_id is null and new.assignee_id is distinct from old.assignee_id and exists (
    select 1 from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = old.project_id and pm.user_id = old.assignee_id and pm.is_active
      and not exists (select 1 from private.studio_member_removal_unassignment_permits permit where permit.studio_id = p.studio_id and permit.user_id = old.assignee_id)
  ) then raise exception 'Active project tasks cannot be manually unassigned'; end if;
  return new;
end;
$$;

revoke execute on function private.enforce_task_edit_permissions()
from public, anon, authenticated;
