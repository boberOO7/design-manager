-- Keep the private active-assignee helper inaccessible to API roles. This
-- security-invoker RPC enforces the same membership predicate directly.
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
  if project_status = 'archived' or (project_status = 'completed' and p_stage in ('stage_1', 'stage_2', 'stage_3')) then
    raise exception 'This project stage is read-only';
  end if;
  if not exists (
    select 1
    from public.project_members as assignment
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project_studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee on assignee.id = assignment.user_id
    where assignment.project_id = p_project_id
      and assignment.user_id = p_assignee_id
      and assignment.is_active
      and studio_member.is_active
      and assignee.is_active
  ) then
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
