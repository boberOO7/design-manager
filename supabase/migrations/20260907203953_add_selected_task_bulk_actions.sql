create or replace function public.bulk_assign_selected_project_tasks(
  p_project_id uuid,
  p_stage text,
  p_assignee_id uuid,
  p_task_ids uuid[]
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_studio_id uuid;
  project_status text;
  selected_count integer;
begin
  if p_stage not in ('stage_1', 'stage_2', 'stage_3', 'stage_4')
    or coalesce(cardinality(p_task_ids), 0) = 0
    or cardinality(p_task_ids) > 200
    or cardinality(p_task_ids) <> cardinality(array(select distinct unnest(p_task_ids))) then
    raise exception 'Choose a non-empty unique task batch';
  end if;

  select project.studio_id, project.status into project_studio_id, project_status
  from public.projects as project where project.id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can assign project tasks';
  end if;
  if project_status = 'archived' or (project_status = 'completed' and private.is_project_progress_stage(p_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  if not private.is_active_project_task_assignee(p_project_id, p_assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;

  perform 1 from public.tasks as task where task.id = any(p_task_ids) order by task.id for update;
  select count(*) into selected_count
  from public.tasks as task
  where task.id = any(p_task_ids)
    and task.project_id = p_project_id
    and task.stage = p_stage
    and task.status <> 'cancelled';
  if selected_count <> cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;

  return query update public.tasks as task set assignee_id = p_assignee_id
  where task.id = any(p_task_ids) returning task.id;
end;
$$;

revoke execute on function public.bulk_assign_selected_project_tasks(uuid, text, uuid, uuid[])
from public, anon;
grant execute on function public.bulk_assign_selected_project_tasks(uuid, text, uuid, uuid[])
to authenticated;

create or replace function public.bulk_set_project_task_deadline(
  p_project_id uuid,
  p_stage text,
  p_task_ids uuid[],
  p_target_status text,
  p_due_date date
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_studio_id uuid;
  project_status text;
  selected_count integer;
begin
  if p_stage not in ('stage_1', 'stage_2', 'stage_3', 'stage_4')
    or p_target_status not in ('internal_review', 'review', 'completed')
    or p_due_date is null
    or coalesce(cardinality(p_task_ids), 0) = 0
    or cardinality(p_task_ids) > 200
    or cardinality(p_task_ids) <> cardinality(array(select distinct unnest(p_task_ids))) then
    raise exception 'Choose a valid task batch, workflow milestone, and deadline';
  end if;

  select project.studio_id, project.status into project_studio_id, project_status
  from public.projects as project where project.id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can edit task deadlines';
  end if;
  if project_status = 'archived' or (project_status = 'completed' and private.is_project_progress_stage(p_stage)) then
    raise exception 'This project stage is read-only';
  end if;

  perform 1 from public.tasks as task where task.id = any(p_task_ids) order by task.id for update;
  select count(*) into selected_count
  from public.tasks as task
  where task.id = any(p_task_ids)
    and task.project_id = p_project_id
    and task.stage = p_stage;
  if selected_count <> cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;

  delete from public.task_deadlines as deadline
  where deadline.task_id = any(p_task_ids) and deadline.target_status = p_target_status;
  return query insert into public.task_deadlines (task_id, target_status, due_date)
  select task_id, p_target_status, p_due_date from unnest(p_task_ids) as task_id
  returning task_deadlines.id;
end;
$$;

revoke execute on function public.bulk_set_project_task_deadline(uuid, text, uuid[], text, date)
from public, anon;
grant execute on function public.bulk_set_project_task_deadline(uuid, text, uuid[], text, date)
to authenticated;
