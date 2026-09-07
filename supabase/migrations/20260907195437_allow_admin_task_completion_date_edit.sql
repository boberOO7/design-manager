-- Task completion is stored as a date, while leaderboard periods read the
-- corresponding immutable attribution timestamp. Allow administrators to
-- correct both values atomically without changing normal status transitions.

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
  is_completion_date_only_edit boolean;
begin
  select project.status, project.studio_id into project_status, task_studio_id
  from public.projects as project where project.id = old.project_id;

  if project_status is null or project_status = 'archived' then raise exception 'Archived projects are read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  is_completion_date_only_edit := is_admin
    and new.completed_at is distinct from old.completed_at
    and (to_jsonb(new) - array['completed_at', 'updated_at']) = (to_jsonb(old) - array['completed_at', 'updated_at']);
  if project_status = 'completed'
    and (private.is_project_progress_stage(old.stage) or private.is_project_progress_stage(new.stage))
    and not is_completion_date_only_edit then
    raise exception 'Completed production tasks are read-only until the project is reopened';
  end if;

  if new.completed_at is distinct from old.completed_at then
    if not is_admin then raise exception 'Only administrators may edit task completion dates'; end if;
    if old.status <> 'completed' or new.status <> 'completed' or new.completed_at is null then
      raise exception 'Only completed tasks may have a completion date';
    end if;
    if new.completed_at > current_date then
      raise exception 'Task completion date cannot be in the future';
    end if;
  end if;

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

create or replace function private.sync_task_productivity_completion_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.productivity_attributions
  set completed_at = new.completed_at::timestamp at time zone 'Europe/Kyiv'
  where task_id = new.id
    and source_type = 'task'
    and voided_at is null;
  return new;
end;
$$;

revoke execute on function private.sync_task_productivity_completion_date()
from public, anon, authenticated;

drop trigger if exists sync_task_productivity_completion_date_after_update on public.tasks;
create trigger sync_task_productivity_completion_date_after_update
after update of completed_at on public.tasks
for each row
when (
  old.status = 'completed'
  and new.status = 'completed'
  and old.completed_at is distinct from new.completed_at
)
execute function private.sync_task_productivity_completion_date();

create or replace function public.update_task_details_with_collaborators(
  p_task_id uuid,
  p_task jsonb,
  p_collaborator_ids uuid[] default '{}',
  p_deadlines jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project_id uuid;
  task_studio_id uuid;
  task_status text;
  project_status text;
  project_archived_at date;
  requested_id uuid;
begin
  select task.project_id, project.studio_id, task.status, project.status, project.archived_at
  into task_project_id, task_studio_id, task_status, project_status, project_archived_at
  from public.tasks as task
  inner join public.projects as project on project.id = task.project_id
  where task.id = p_task_id
  for update of task;

  if task_project_id is null or (select auth.uid()) is null or not private.is_studio_admin(task_studio_id) then
    raise exception 'Only active studio administrators can edit task details';
  end if;
  if p_task ? 'completed_at' and (select count(*) from jsonb_object_keys(p_task)) = 1 then
    if project_status = 'archived' or project_archived_at is not null then
      raise exception 'Archived project tasks are read-only';
    end if;
    if task_status <> 'completed' or nullif(p_task ->> 'completed_at', '') is null then
      raise exception 'Only completed tasks may have a completion date';
    end if;
    if (p_task ->> 'completed_at')::date > current_date then
      raise exception 'Task completion date cannot be in the future';
    end if;
    update public.tasks set completed_at = (p_task ->> 'completed_at')::date where id = p_task_id;
    return;
  end if;
  if p_task ? 'completed_at' then
    if task_status <> 'completed' or nullif(p_task ->> 'completed_at', '') is null then
      raise exception 'Only completed tasks may have a completion date';
    end if;
    if (p_task ->> 'completed_at')::date > current_date then
      raise exception 'Task completion date cannot be in the future';
    end if;
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

  update public.tasks as task set
    title = p_task ->> 'title',
    description = nullif(p_task ->> 'description', ''),
    assignee_id = nullif(p_task ->> 'assignee_id', '')::uuid,
    priority = p_task ->> 'priority',
    completed_area_m2 = nullif(p_task ->> 'completed_area_m2', '')::numeric,
    progress_weight = (p_task ->> 'progress_weight')::numeric,
    stage = p_task ->> 'stage',
    completed_at = case
      when p_task ? 'completed_at' then (p_task ->> 'completed_at')::date
      else task.completed_at
    end
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

revoke execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb)
from public, anon;
grant execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb)
to authenticated;

create or replace function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_studio_id uuid;
  activity_changes jsonb := '{}'::jsonb;
begin
  select studio_id into project_studio_id from public.projects where id = coalesce(new.project_id, old.project_id);
  if tg_op = 'INSERT' then
    perform private.record_project_activity(project_studio_id, new.project_id, 'task_created', 'task', new.id,
      jsonb_strip_nulls(jsonb_build_object('status', new.status, 'priority', new.priority, 'assignee_id', new.assignee_id, 'due_date', new.due_date)));
    return new;
  end if;
  if new.status is distinct from old.status then activity_changes := activity_changes || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)); end if;
  if new.assignee_id is distinct from old.assignee_id then activity_changes := activity_changes || jsonb_build_object('assignee_id', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id)); end if;
  if new.priority is distinct from old.priority then activity_changes := activity_changes || jsonb_build_object('priority', jsonb_build_object('from', old.priority, 'to', new.priority)); end if;
  if new.due_date is distinct from old.due_date then activity_changes := activity_changes || jsonb_build_object('due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date)); end if;
  if new.completed_at is distinct from old.completed_at then activity_changes := activity_changes || jsonb_build_object('completed_at', jsonb_build_object('from', old.completed_at, 'to', new.completed_at)); end if;
  if activity_changes <> '{}'::jsonb then
    perform private.record_project_activity(project_studio_id, new.project_id, 'task_updated', 'task', new.id, activity_changes);
  end if;
  return new;
end;
$$;

revoke execute on function private.log_task_activity()
from public, anon, authenticated;
