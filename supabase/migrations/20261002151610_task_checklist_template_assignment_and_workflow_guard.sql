-- Task checklist templates are assigned once; checklist rows remain editable snapshots.
-- Existing imported/manual checklists have no recoverable template identity.
alter table public.tasks
  add column checklist_template_id uuid references public.checklist_templates(id) on delete set null;
create index tasks_checklist_template_id_idx on public.tasks(checklist_template_id)
  where checklist_template_id is not null;
-- Assignment updates go through the guarded atomic RPC, not direct column writes.
grant insert (checklist_template_id) on public.tasks to authenticated;

create or replace function private.validate_task_checklist_template()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.checklist_template_id is not null
    and (tg_op = 'INSERT' or new.checklist_template_id is distinct from old.checklist_template_id)
    and not exists (
      select 1 from public.checklist_templates template
      join public.projects project on project.studio_id = template.studio_id
      where template.id = new.checklist_template_id and project.id = new.project_id
    ) then raise exception 'Choose an active checklist template from this studio'; end if;
  return new;
end;
$$;
revoke execute on function private.validate_task_checklist_template() from public, anon, authenticated;
create trigger validate_task_checklist_template_before_write
  before insert or update of checklist_template_id on public.tasks
  for each row execute function private.validate_task_checklist_template();

create or replace function public.set_task_checklist_template(p_task_id uuid, p_template_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_edit_task_checklist(p_task_id), false) then
    raise exception 'Checklist editing is available only to task editors while the task is To do or In progress';
  end if;
  if task_row.checklist_template_id is not distinct from p_template_id then return; end if;
  if p_template_id is not null and not exists (
    select 1 from public.checklist_templates template
    join public.projects project on project.studio_id = template.studio_id
    where template.id = p_template_id and project.id = task_row.project_id
      and template.archived_at is null
  ) then raise exception 'Choose an active checklist template from this studio'; end if;
  -- Existing template snapshots may refer to archived templates; new assignment
  -- is restricted to active templates by this operation.
  update public.tasks set checklist_template_id = p_template_id where id = p_task_id;
  delete from public.task_checklist_items where task_id = p_task_id;
  insert into public.task_checklist_items(task_id, title, weight, position)
  select p_task_id, item.title, item.weight, item.position
  from public.checklist_template_items item where item.template_id = p_template_id
  order by item.position, item.id;
end;
$$;
revoke execute on function public.set_task_checklist_template(uuid, uuid) from public, anon;
grant execute on function public.set_task_checklist_template(uuid, uuid) to authenticated;

-- This is the single checklist gate for single-task, bulk and direct updates.
create or replace function private.enforce_task_progress_workflow()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  -- Canonical order, matching src/lib/task-workflow.ts; stage column visibility
  -- does not change the workflow boundary.
  workflow constant text[] := array['todo', 'in_progress', 'internal_review', 'review', 'completed'];
  review_boundary constant integer := array_position(workflow, 'internal_review');
begin
  if new.status is distinct from old.status
    and array_position(workflow, new.status) >= review_boundary
    and exists (
      select 1 from public.task_checklist_items item
      where item.task_id = old.id and not item.is_completed and not item.is_not_needed
    ) then
    raise exception 'Complete every checklist item before moving this task to Internal Review or a later status';
  end if;

  if new.status is distinct from old.status
    and new.status = 'in_progress' and not old.manual_progress_override then
    new.production_completion := case
      when array_position(workflow, old.status) >= review_boundary then 70 else 0 end;
    new.manual_progress_override := false;
  elsif (new.production_completion is distinct from old.production_completion
      or new.manual_progress_override is distinct from old.manual_progress_override)
    and new.status <> 'in_progress' then
    raise exception 'Manual production completion is editable only while a task is in progress';
  end if;
  return new;
end;
$$;

create or replace function public.create_task_with_checklist(p_task jsonb, p_checklist_items jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  new_task_id uuid;
  task_project_id uuid := (p_task ->> 'project_id')::uuid;
  collaborator_ids uuid[];
  requested_id uuid;
begin
  if jsonb_typeof(coalesce(p_task -> 'collaborator_ids', '[]'::jsonb)) <> 'array' then raise exception 'Task co-assignees must be an array'; end if;
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into collaborator_ids
  from jsonb_array_elements_text(coalesce(p_task -> 'collaborator_ids', '[]'::jsonb));
  if cardinality(collaborator_ids) <> cardinality(array(select distinct unnest(collaborator_ids))) then raise exception 'Task co-assignees must be unique'; end if;
  foreach requested_id in array collaborator_ids loop
    if not private.is_active_task_collaborator(task_project_id, requested_id) then raise exception 'Task co-assignee must be an active project member'; end if;
  end loop;
  if p_task ? 'deadlines' and jsonb_typeof(p_task -> 'deadlines') <> 'array' then raise exception 'Task deadlines must be an array'; end if;
  if p_task ? 'deadlines' and exists (
    select 1 from jsonb_to_recordset(p_task -> 'deadlines') as deadline(target_status text, due_date date)
    where deadline.target_status not in ('internal_review', 'review', 'completed') or deadline.due_date is null
  ) then raise exception 'Task deadlines must use a workflow milestone and valid date'; end if;
  if p_task ? 'deadlines' and (select count(*) from jsonb_to_recordset(p_task -> 'deadlines') as deadline(target_status text, due_date date))
    <> (select count(distinct deadline.target_status) from jsonb_to_recordset(p_task -> 'deadlines') as deadline(target_status text, due_date date)) then
    raise exception 'Task deadlines must be unique per workflow milestone';
  end if;
  insert into public.tasks (project_id, title, description, priority, assignee_id, created_by, completed_area_m2, progress_weight, stage, status, checklist_template_id)
  values (task_project_id, p_task ->> 'title', nullif(p_task ->> 'description', ''), p_task ->> 'priority', (p_task ->> 'assignee_id')::uuid, auth.uid(), nullif(p_task ->> 'completed_area_m2', '')::numeric, coalesce(nullif(p_task ->> 'progress_weight', '')::numeric, 1), coalesce(nullif(p_task ->> 'stage', ''), 'stage_1'), 'todo', nullif(p_task ->> 'checklist_template_id', '')::uuid) returning id into new_task_id;
  insert into public.task_collaborators (task_id, user_id)
  select new_task_id, collaborator_id
  from unnest(collaborator_ids) as collaborator_id
  where collaborator_id <> (p_task ->> 'assignee_id')::uuid
  on conflict (task_id, user_id) do nothing;
  if p_task ? 'deadlines' then
    insert into public.task_deadlines (task_id, target_status, due_date)
    select new_task_id, deadline.target_status, deadline.due_date
    from jsonb_to_recordset(p_task -> 'deadlines') as deadline(target_status text, due_date date);
  elsif nullif(p_task ->> 'due_date', '') is not null then
    insert into public.task_deadlines (task_id, target_status, due_date) values (new_task_id, 'completed', (p_task ->> 'due_date')::date);
  end if;
  insert into public.task_checklist_items (task_id, title, weight, position)
  select new_task_id, item.title, item.weight, 0 from (select value ->> 'title' as title, (value ->> 'weight')::numeric as weight, ordinality from jsonb_array_elements(p_checklist_items) with ordinality) as item
  where char_length(btrim(item.title)) between 1 and 200 and item.weight > 0 and item.weight <= 1000 and trunc(item.weight) = item.weight order by item.ordinality;
  if jsonb_array_length(p_checklist_items) <> (select count(*) from public.task_checklist_items where task_id = new_task_id) then raise exception 'Checklist items must have a title and a whole-number weight from 1 to 1000'; end if;
  return new_task_id;
end;
$$;

create or replace function private.copy_project_template_stage_tasks(
  p_project_id uuid, p_template_id uuid, p_source_stage text,
  p_destination_stage text, p_assignee_id uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  template_task record;
  predecessor_position integer;
  predecessor_task_id uuid;
  new_task_id uuid;
  copied_count integer := 0;
  mapped_tasks jsonb := '{}'::jsonb;
  anchor date;
  task_start date;
  task_due date;
  next_order integer;
begin
  select coalesce(stage_columns.schedule_anchor_date, project.start_date),
    coalesce(max(schedule.sort_order), -1) + 1
  into anchor, next_order
  from public.projects project
  join public.project_task_stage_columns stage_columns
    on stage_columns.project_id = project.id and stage_columns.stage = p_destination_stage
  left join public.task_schedules schedule
    on schedule.project_id = project.id and schedule.stage = p_destination_stage
  where project.id = p_project_id
  group by stage_columns.schedule_anchor_date, project.start_date;

  for template_task in
    select id, title, checklist_template_id, expected_workdays, depends_on_positions, position
    from public.project_template_tasks
    where template_id = p_template_id and stage = p_source_stage
    order by position, id
  loop
    insert into public.tasks (project_id,title,priority,assignee_id,created_by,stage,status,checklist_template_id)
    values (p_project_id,template_task.title,'normal',p_assignee_id,auth.uid(),p_destination_stage,'todo',template_task.checklist_template_id)
    returning id into new_task_id;
    mapped_tasks := mapped_tasks || jsonb_build_object(template_task.position::text, new_task_id);

    insert into public.task_checklist_items (task_id,title,weight,position)
    select new_task_id,item.title,item.weight,item.position
    from public.checklist_template_items item
    where item.template_id = template_task.checklist_template_id
    order by item.position,item.id;

    if template_task.expected_workdays is not null then
      if anchor is null then raise exception 'A schedule start date is required'; end if;
      task_start := private.schedule_workday_on_or_after(anchor);
      foreach predecessor_position in array template_task.depends_on_positions loop
        predecessor_task_id := (mapped_tasks ->> predecessor_position::text)::uuid;
        if predecessor_task_id is null then raise exception 'Invalid template dependency'; end if;
        select greatest(task_start, private.schedule_add_workdays(predecessor.baseline_due, 1))
        into task_start from public.task_schedules predecessor where predecessor.task_id = predecessor_task_id;
      end loop;
      task_due := private.schedule_add_workdays(task_start, template_task.expected_workdays - 1);
      insert into public.task_schedules(
        task_id,project_id,stage,sort_order,expected_workdays,
        baseline_start,baseline_due,current_start,current_due,is_paused
      ) values (
        new_task_id,p_project_id,p_destination_stage,next_order,template_task.expected_workdays,
        task_start,task_due,task_start,task_due,
        exists (select 1 from public.project_task_stage_columns
          where project_id=p_project_id and stage=p_destination_stage and schedule_paused_on is not null)
      );
      next_order := next_order + 1;
      foreach predecessor_position in array template_task.depends_on_positions loop
        insert into public.task_schedule_dependencies (task_id,predecessor_task_id)
        values (new_task_id,(mapped_tasks ->> predecessor_position::text)::uuid);
      end loop;
      insert into public.task_deadlines (task_id,target_status,due_date)
      values (new_task_id,'internal_review',task_due);
    end if;
    copied_count := copied_count + 1;
  end loop;
  return copied_count;
end;
$$;

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
