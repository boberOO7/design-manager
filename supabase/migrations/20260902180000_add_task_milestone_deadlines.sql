create table public.task_deadlines (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  target_status text not null check (target_status in ('internal_review', 'review', 'completed')),
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, target_status)
);

create index task_deadlines_due_date_idx on public.task_deadlines(due_date);

create trigger set_task_deadlines_updated_at
before update on public.task_deadlines
for each row execute function public.set_updated_at();

insert into public.task_deadlines (task_id, target_status, due_date)
select id, 'completed', due_date
from public.tasks
where due_date is not null
on conflict (task_id, target_status) do nothing;

-- Legacy `tasks.due_date` remains during the rolling deployment, but all new
-- deadline writes are stored in the normalized milestone table.
alter table public.task_deadlines enable row level security;
revoke all on table public.task_deadlines from anon, authenticated;
grant select, insert, delete on table public.task_deadlines to authenticated;

create policy "task_deadlines_select_for_authorized_users"
on public.task_deadlines for select to authenticated
using ((select private.can_access_project((select project_id from public.tasks where id = task_id))));

create policy "task_deadlines_write_for_studio_admins"
on public.task_deadlines for all to authenticated
using (
  exists (
    select 1
    from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id and private.is_studio_admin(project.studio_id)
  )
)
with check (
  exists (
    select 1
    from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id and private.is_studio_admin(project.studio_id)
  )
);

drop function public.update_task_details_with_collaborators(uuid, jsonb, uuid[]);

create or replace function public.update_task_details_with_collaborators(
  p_task_id uuid,
  p_task jsonb,
  p_collaborator_ids uuid[] default '{}',
  p_deadlines jsonb default null
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
  select task.project_id, project.studio_id
  into task_project_id, task_studio_id
  from public.tasks as task
  inner join public.projects as project on project.id = task.project_id
  where task.id = p_task_id;

  if task_project_id is null or not private.is_studio_admin(task_studio_id) then
    raise exception 'Only active studio administrators can edit task details';
  end if;
  if p_deadlines is not null and jsonb_typeof(p_deadlines) <> 'array' then raise exception 'Task deadlines must be an array'; end if;
  if p_deadlines is not null and exists (
    select 1
    from jsonb_to_recordset(p_deadlines) as deadline(target_status text, due_date date)
    where deadline.target_status not in ('internal_review', 'review', 'completed')
       or deadline.due_date is null
  ) then raise exception 'Task deadlines must use a workflow milestone and valid date'; end if;
  if p_deadlines is not null and (select count(*) from jsonb_to_recordset(p_deadlines) as deadline(target_status text, due_date date))
     <> (select count(distinct deadline.target_status) from jsonb_to_recordset(p_deadlines) as deadline(target_status text, due_date date)) then
    raise exception 'Task deadlines must be unique per workflow milestone';
  end if;
  if cardinality(p_collaborator_ids) <> cardinality(array(select distinct unnest(p_collaborator_ids))) then
    raise exception 'Task co-assignees must be unique';
  end if;
  foreach requested_id in array p_collaborator_ids loop
    if not private.is_active_task_collaborator(task_project_id, requested_id) then
      raise exception 'Task co-assignee must be an active project member';
    end if;
  end loop;
  if nullif(p_task ->> 'assignee_id', '') is not null and nullif(p_task ->> 'assignee_id', '')::uuid = any(p_collaborator_ids) then
    p_collaborator_ids := array_remove(p_collaborator_ids, nullif(p_task ->> 'assignee_id', '')::uuid);
  end if;

  update public.tasks set
    title = p_task ->> 'title',
    description = nullif(p_task ->> 'description', ''),
    assignee_id = nullif(p_task ->> 'assignee_id', '')::uuid,
    priority = p_task ->> 'priority',
    completed_area_m2 = nullif(p_task ->> 'completed_area_m2', '')::numeric,
    progress_weight = (p_task ->> 'progress_weight')::numeric,
    stage = p_task ->> 'stage'
  where id = p_task_id;

  delete from public.task_collaborators where task_id = p_task_id and not (user_id = any(p_collaborator_ids));
  insert into public.task_collaborators (task_id, user_id)
  select p_task_id, unnest(p_collaborator_ids) on conflict (task_id, user_id) do nothing;

  if p_deadlines is not null then
    delete from public.task_deadlines where task_id = p_task_id;
    insert into public.task_deadlines (task_id, target_status, due_date)
    select p_task_id, deadline.target_status, deadline.due_date
    from jsonb_to_recordset(p_deadlines) as deadline(target_status text, due_date date);
  end if;
end;
$$;

revoke execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb) to authenticated;

create or replace function public.create_task_with_checklist(p_task jsonb, p_checklist_items jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_task_id uuid;
begin
  insert into public.tasks (project_id, title, description, priority, assignee_id, created_by, completed_area_m2, stage, status)
  values ((p_task ->> 'project_id')::uuid, p_task ->> 'title', nullif(p_task ->> 'description', ''), p_task ->> 'priority', (p_task ->> 'assignee_id')::uuid, auth.uid(), nullif(p_task ->> 'completed_area_m2', '')::numeric, coalesce(nullif(p_task ->> 'stage', ''), 'stage_1'), coalesce(nullif(p_task ->> 'status', ''), 'todo')) returning id into new_task_id;
  if nullif(p_task ->> 'due_date', '') is not null then
    insert into public.task_deadlines (task_id, target_status, due_date) values (new_task_id, 'completed', (p_task ->> 'due_date')::date);
  end if;
  insert into public.task_checklist_items (task_id, title, weight, position)
  select new_task_id, item.title, item.weight, 0 from (select value ->> 'title' as title, (value ->> 'weight')::numeric as weight, ordinality from jsonb_array_elements(p_checklist_items) with ordinality) as item
  where char_length(btrim(item.title)) between 1 and 200 and item.weight > 0 and item.weight <= 1000 and trunc(item.weight) = item.weight order by item.ordinality;
  if jsonb_array_length(p_checklist_items) <> (select count(*) from public.task_checklist_items where task_id = new_task_id) then raise exception 'Checklist items must have a title and a whole-number weight from 1 to 1000'; end if;
  return new_task_id;
end;
$$;
