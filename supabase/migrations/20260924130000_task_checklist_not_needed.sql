alter table public.task_checklist_items
  add column is_not_needed boolean not null default false,
  add constraint task_checklist_items_one_resolution check (not (is_completed and is_not_needed));

grant update (is_not_needed) on public.task_checklist_items to authenticated;

CREATE OR REPLACE FUNCTION private.enforce_task_progress_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    update public.task_checklist_items
    set is_completed = true
    where task_id = old.id and not is_completed and not is_not_needed;
  elsif new.status = 'completed'
    and exists (
      select 1 from public.task_checklist_items as item
      where item.task_id = old.id and not item.is_completed and not item.is_not_needed
    ) then
    raise exception 'Complete every checklist item before moving this task to done';
  end if;

  if new.status is distinct from old.status
    and new.status = 'in_progress'
    and not old.manual_progress_override then
    new.production_completion := case
      when old.status in ('internal_review', 'review', 'completed') then 70
      else 0
    end;
    new.manual_progress_override := false;
  elsif (new.production_completion is distinct from old.production_completion
      or new.manual_progress_override is distinct from old.manual_progress_override)
    and new.status <> 'in_progress' then
    raise exception 'Manual production completion is editable only while a task is in progress';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_move_project_tasks(p_project_id uuid, p_stage text, p_source_statuses text[], p_target_status text, p_task_ids uuid[])
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    where item.task_id = any(p_task_ids) and not item.is_completed and not item.is_not_needed
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
$function$;

