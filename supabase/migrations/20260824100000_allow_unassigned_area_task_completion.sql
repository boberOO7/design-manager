-- Area allocation is project-progress data. A missing assignee means there is
-- no employee to credit, not that the task cannot be completed.
create or replace function private.record_task_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project public.projects%rowtype;
  contributor public.profiles%rowtype;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.completed_area_m2 is null or new.assignee_id is null then return new; end if;
    select * into task_project from public.projects where id = new.project_id;
    select * into contributor from public.profiles where id = new.assignee_id;
    if task_project.id is null
      or contributor.id is null
      or not exists (
        select 1 from public.project_members as member
        inner join public.studio_members as studio_member
          on studio_member.studio_id = task_project.studio_id
          and studio_member.user_id = new.assignee_id
          and studio_member.is_active = true
        where member.project_id = new.project_id
          and member.user_id = new.assignee_id
          and member.is_active = true
          and contributor.is_active = true
      ) then
      raise exception 'Attributed task completion requires an active project-member assignee';
    end if;
    insert into public.productivity_attributions (
      studio_id, project_id, task_id, contributor_id, source_type, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    ) values (
      task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', new.completed_area_m2,
      now(), contributor.full_name, contributor.job_title
    );
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions
      set voided_at = now()
      where task_id = old.id and source_type = 'task' and voided_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_task_productivity_attribution() from public, anon, authenticated;

-- Preserve the active-project-member requirement only when a completion will
-- create employee attribution. Unassigned work receives no attribution.
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
    and private.can_update_project_task_status(task.project_id, task.assignee_id);

  if selected_count <> cardinality(p_task_ids) then
    raise exception 'Every task in the batch must still be available in the source column';
  end if;

  if not exists (
    select 1 from public.project_task_stage_columns as columns
    where columns.project_id = p_project_id
      and columns.stage = p_stage
      and p_target_status = any(columns.enabled_statuses)
  ) then
    raise exception 'Choose a status enabled for this task stage';
  end if;

  if p_target_status = 'completed' and exists (
    select 1 from public.task_checklist_items as item
    where item.task_id = any(p_task_ids) and not item.is_completed
  ) then
    raise exception 'Complete every checklist item before moving this batch to Done';
  end if;

  if p_target_status = 'completed' and exists (
    select 1 from public.tasks as task
    where task.id = any(p_task_ids)
      and task.completed_area_m2 is not null
      and task.assignee_id is not null
      and not exists (
        select 1 from public.project_members as member
        inner join public.projects as project on project.id = member.project_id
        inner join public.studio_members as studio_member
          on studio_member.studio_id = project.studio_id
          and studio_member.user_id = member.user_id
        inner join public.profiles as profile on profile.id = member.user_id
        where member.project_id = task.project_id
          and member.user_id = task.assignee_id
          and member.is_active
          and studio_member.is_active
          and profile.is_active
      )
  ) then
    raise exception 'A task with task area must be assigned to an active project member before marking this batch complete';
  end if;

  return query
  update public.tasks as task
  set status = p_target_status
  where task.id = any(p_task_ids)
  returning task.id;
end;
$$;

revoke execute on function public.bulk_move_project_tasks(uuid, text, text[], text, uuid[]) from public, anon;
grant execute on function public.bulk_move_project_tasks(uuid, text, text[], text, uuid[]) to authenticated;
