-- Keep the membership helper unavailable to API roles. The security-invoker
-- stage assignment RPC checks the same active project/studio/profile membership
-- predicate directly after its studio-admin guard.
create or replace function public.bulk_assign_project_stage_tasks(
  p_project_id uuid,
  p_stage text,
  p_assignee_id uuid,
  p_scope text
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_studio_id uuid;
  project_status text;
  selected_task_ids uuid[];
begin
  if p_stage not in ('stage_1', 'stage_2', 'stage_3', 'stage_4') or p_scope not in ('unassigned', 'all') then
    raise exception 'Choose a valid task stage and assignment scope';
  end if;

  select project.studio_id, project.status into project_studio_id, project_status
  from public.projects as project where project.id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can assign project tasks';
  end if;
  if project_status = 'archived' or (project_status = 'completed' and private.is_project_progress_stage(p_stage)) then
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

  select coalesce(array_agg(source_task.task_id), '{}'::uuid[]) into selected_task_ids
  from (
    select task.id as task_id from public.tasks as task
    where task.project_id = p_project_id and task.stage = p_stage and task.status <> 'cancelled'
      and (p_scope = 'all' or task.assignee_id is null)
      and task.assignee_id is distinct from p_assignee_id
    order by task.id for update
  ) as source_task;
  if cardinality(selected_task_ids) = 0 then return; end if;

  return query update public.tasks as task set assignee_id = p_assignee_id
  where task.id = any(selected_task_ids) returning task.id;
end;
$$;

revoke execute on function public.bulk_assign_project_stage_tasks(uuid, text, uuid, text)
from public, anon;
grant execute on function public.bulk_assign_project_stage_tasks(uuid, text, uuid, text)
to authenticated;
