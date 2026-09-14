-- Stage 4 support redefined this RPC without the null-assignee exception already
-- used by single-task completion and the productivity trigger. Only assigned
-- productivity-bearing work needs an active project member to receive credit.
create or replace function public.bulk_move_project_tasks(
  p_project_id uuid,
  p_stage text,
  p_source_statuses text[],
  p_target_status text,
  p_task_ids uuid[]
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_count integer;
begin
  if coalesce(array_length(p_task_ids, 1), 0) = 0
    or cardinality(p_task_ids) <> cardinality(array(select distinct unnest(p_task_ids))) then
    raise exception 'Choose a non-empty unique task batch';
  end if;
  if p_target_status not in ('todo', 'in_progress', 'internal_review', 'review', 'completed')
    or exists (select 1 from unnest(p_source_statuses) as source_status where source_status not in ('todo', 'in_progress', 'internal_review', 'review', 'completed', 'cancelled'))
    or p_target_status = any(p_source_statuses) then
    raise exception 'Choose different valid task statuses';
  end if;

  perform 1 from public.tasks as task where task.id = any(p_task_ids) order by task.id for update;
  select count(*) into selected_count
  from public.tasks as task
  where task.id = any(p_task_ids)
    and task.project_id = p_project_id
    and task.stage = p_stage
    and task.status = any(p_source_statuses)
    and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage);
  if selected_count <> cardinality(p_task_ids) then
    raise exception 'Every task in the batch must still be available in the source column';
  end if;
  if not exists (
    select 1 from public.project_task_stage_columns as columns
    where columns.project_id = p_project_id and columns.stage = p_stage
      and p_target_status = any(columns.enabled_statuses)
  ) then raise exception 'Choose a status enabled for this task stage'; end if;
  if p_target_status = 'completed' and exists (
    select 1 from public.task_checklist_items as item
    where item.task_id = any(p_task_ids) and not item.is_completed
  ) then raise exception 'Complete every checklist item before moving this batch to Done'; end if;
  if p_target_status = 'completed' and exists (
    select 1 from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = any(p_task_ids)
      and task.assignee_id is not null
      and (
        (task.stage = 'stage_2' and coalesce(task.completed_area_m2, 0) > 0)
        or (task.stage in ('stage_1', 'stage_3') and coalesce(project.total_area_m2, 0) > 0)
      )
      and not exists (
        select 1 from public.project_members as member
        inner join public.studio_members as studio_member
          on studio_member.studio_id = project.studio_id and studio_member.user_id = member.user_id
        inner join public.profiles as profile on profile.id = member.user_id
        where member.project_id = task.project_id and member.user_id = task.assignee_id
          and member.is_active and studio_member.is_active and profile.is_active
      )
  ) then raise exception 'Productivity-bearing work must be assigned to an active project member before marking this batch complete'; end if;

  return query update public.tasks as task set status = p_target_status
  where task.id = any(p_task_ids) returning task.id;
end;
$$;

revoke execute on function public.bulk_move_project_tasks(uuid, text, text[], text, uuid[])
from public, anon;
grant execute on function public.bulk_move_project_tasks(uuid, text, text[], text, uuid[])
to authenticated;
