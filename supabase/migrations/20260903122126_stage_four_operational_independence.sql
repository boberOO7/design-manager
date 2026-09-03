-- Stage identity is stable and language-neutral. Production stages are the
-- stages that contribute to project progress; every other canonical task stage
-- is operational post-completion work.
create or replace function private.is_project_progress_stage(target_stage text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target_stage in ('stage_1', 'stage_2', 'stage_3');
$$;

revoke execute on function private.is_project_progress_stage(text)
from public, anon, authenticated;

create or replace function private.validate_project_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_task_count integer;
  has_progressed_eligible_task boolean;
begin
  if (new.status = 'archived') is distinct from (new.archived_at is not null) then
    raise exception 'Archived projects must have an archive date, and active projects must not';
  end if;

  if old.status in ('completed', 'archived') and (
    new.name is distinct from old.name
    or new.project_code is distinct from old.project_code
    or new.client_name is distinct from old.client_name
    or new.description is distinct from old.description
    or new.total_area_m2 is distinct from old.total_area_m2
    or new.priority is distinct from old.priority
    or new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Completed and archived project details are read-only';
  end if;

  if new.status is not distinct from old.status and new.archived_at is not distinct from old.archived_at then
    if old.status = 'archived' then raise exception 'Archived projects are read-only'; end if;
    if old.status = 'completed' then raise exception 'Completed projects are read-only until reopened'; end if;
    if new.completed_at is distinct from old.completed_at then raise exception 'Completion date is managed through lifecycle transitions'; end if;
    return new;
  end if;

  if new.status = 'archived' then
    if new.completed_at is distinct from old.completed_at then raise exception 'Archiving must preserve the completion date'; end if;
    return new;
  end if;

  if old.status = 'archived' then
    if new.archived_at is not null
      or new.status is distinct from (case when old.completed_at is not null then 'completed' else 'paused' end)
      or new.completed_at is distinct from old.completed_at then
      raise exception 'Archived projects must restore to their established lifecycle target';
    end if;
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at
    and not (old.status in ('active', 'paused') and new.status = 'completed')
    and not (old.status = 'completed' and new.status = 'active') then
    raise exception 'Completion date is managed through lifecycle transitions';
  end if;

  if old.status = 'planned' and new.status = 'active' then return new; end if;
  if old.status = 'active' and new.status = 'paused' then return new; end if;
  if old.status = 'paused' and new.status = 'active' then return new; end if;
  if old.status = 'completed' and new.status = 'active' then new.completed_at := null; return new; end if;

  if old.status = 'paused' and new.status = 'planned' then
    select exists (
      select 1 from public.tasks as task
      where task.project_id = old.id
        and private.is_project_progress_stage(task.stage)
        and task.status not in ('cancelled', 'todo')
    ) into has_progressed_eligible_task;
    if not has_progressed_eligible_task then return new; end if;
    raise exception 'A paused project can return to planned only when eligible tasks are still to do';
  end if;

  if old.status in ('active', 'paused') and new.status = 'completed' then
    select count(*) into open_task_count
    from public.tasks as task
    where task.project_id = old.id
      and private.is_project_progress_stage(task.stage)
      and task.status not in ('completed', 'cancelled');
    if open_task_count = 0 then new.completed_at := current_date; return new; end if;
    raise exception 'A project with open production tasks cannot be completed';
  end if;

  raise exception 'Invalid project lifecycle transition';
end;
$$;

revoke execute on function private.validate_project_lifecycle_transition()
from public, anon, authenticated;

create or replace function private.activate_planned_project_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and private.is_project_progress_stage(new.stage)
    and new.status in ('in_progress', 'internal_review', 'review', 'completed') then
    update public.projects set status = 'active'
    where id = new.project_id and status = 'planned' and archived_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.activate_planned_project_from_task()
from public, anon, authenticated;

create or replace function private.can_create_project_task(
  target_project_id uuid,
  target_assignee_id uuid,
  target_stage text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and (project.status <> 'completed' or not private.is_project_progress_stage(target_stage))
      and private.is_studio_admin(project.studio_id)
      and (
        target_assignee_id is null
        or private.is_active_project_task_assignee(project.id, target_assignee_id)
      )
  );
$$;

revoke execute on function private.can_create_project_task(uuid, uuid, text)
from public, anon;
grant execute on function private.can_create_project_task(uuid, uuid, text)
to authenticated;

drop policy if exists "tasks_insert_for_studio_admins" on public.tasks;
create policy "tasks_insert_for_studio_admins"
on public.tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'todo'
  and completed_at is null
  and (select private.can_create_project_task(project_id, assignee_id, stage))
);

create or replace function private.can_update_project_task_status(
  target_project_id uuid,
  target_assignee_id uuid,
  target_stage text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects as project
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and (project.status <> 'completed' or not private.is_project_progress_stage(target_stage))
      and private.is_studio_admin(project.studio_id)
  ) or (
    target_assignee_id = (select auth.uid())
    and exists (
      select 1
      from public.project_members as assignment
      inner join public.projects as project on project.id = assignment.project_id
      inner join public.studio_members as studio_member
        on studio_member.studio_id = project.studio_id and studio_member.user_id = assignment.user_id
      inner join public.profiles as assignee on assignee.id = assignment.user_id
      where assignment.project_id = target_project_id
        and project.archived_at is null
        and project.status <> 'archived'
        and (project.status <> 'completed' or not private.is_project_progress_stage(target_stage))
        and assignment.user_id = target_assignee_id
        and assignment.is_active and studio_member.is_active and assignee.is_active
    )
  );
$$;

revoke execute on function private.can_update_project_task_status(uuid, uuid, text)
from public, anon;
grant execute on function private.can_update_project_task_status(uuid, uuid, text)
to authenticated;

drop policy if exists "tasks_update_status_for_admins_and_assignees" on public.tasks;
create policy "tasks_update_status_for_admins_and_assignees"
on public.tasks for update to authenticated
using ((select private.can_update_project_task_status(project_id, assignee_id, stage)))
with check (
  (select private.can_update_project_task_status(project_id, assignee_id, stage))
  and status in ('todo', 'in_progress', 'internal_review', 'review', 'completed')
);

drop policy if exists "tasks_delete_for_studio_admins" on public.tasks;
create policy "tasks_delete_for_studio_admins"
on public.tasks for delete to authenticated
using ((select private.can_update_project_task_status(project_id, assignee_id, stage)) and private.is_studio_admin((select studio_id from public.projects where id = project_id)));

create or replace function private.can_edit_task_checklist(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks as task
    where task.id = target_task_id
      and task.status in ('todo', 'in_progress')
      and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)
  );
$$;

revoke execute on function private.can_edit_task_checklist(uuid)
from public, anon;
grant execute on function private.can_edit_task_checklist(uuid)
to authenticated;

drop policy if exists "task_collaborators_write_for_studio_admins" on public.task_collaborators;
create policy "task_collaborators_write_for_studio_admins"
on public.task_collaborators for all to authenticated
using (
  exists (
    select 1 from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
      and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)
  )
)
with check (
  exists (
    select 1 from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
      and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)
  )
);

drop policy if exists "task_deadlines_write_for_studio_admins" on public.task_deadlines;
create policy "task_deadlines_write_for_studio_admins"
on public.task_deadlines for all to authenticated
using (
  exists (
    select 1 from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
      and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)
  )
)
with check (
  exists (
    select 1 from public.tasks as task
    inner join public.projects as project on project.id = task.project_id
    where task.id = task_id
      and private.is_studio_admin(project.studio_id)
      and private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage)
  )
);

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
  if project_status = 'completed'
    and (private.is_project_progress_stage(old.stage) or private.is_project_progress_stage(new.stage)) then
    raise exception 'Completed production tasks are read-only until the project is reopened';
  end if;

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

-- Stage 4 task completions are task-count events, not area events. A zero ledger
-- amount lets the existing immutable completion/reopen history count the task
-- while tasks.productivity_area_m2 remains NULL.
alter table public.productivity_attributions
  drop constraint productivity_attributions_credited_area_m2_check;
alter table public.productivity_attributions
  add constraint productivity_attributions_credited_area_m2_check check (credited_area_m2 >= 0);
alter table public.productivity_attributions
  add column task_stage text null check (task_stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4'));

update public.productivity_attributions as attribution
set task_stage = task.stage
from public.tasks as task
where attribution.source_type = 'task' and attribution.task_id = task.id;

create or replace function private.record_task_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project public.projects%rowtype;
  contributor public.profiles%rowtype;
  stage_budget public.project_stage_productivity_budgets%rowtype;
  snapshot_area numeric;
  remaining_tasks integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into task_project from public.projects where id = new.project_id;
    if task_project.id is null then raise exception 'Task project no longer exists'; end if;
    if new.assignee_id is null then return new; end if;

    if not private.is_project_progress_stage(new.stage) then
      select * into contributor from public.profiles where id = new.assignee_id;
      if contributor.id is null or not exists (
        select 1 from public.project_members as member
        inner join public.studio_members as studio_member
          on studio_member.studio_id = task_project.studio_id
          and studio_member.user_id = new.assignee_id and studio_member.is_active
        where member.project_id = new.project_id and member.user_id = new.assignee_id
          and member.is_active and contributor.is_active
      ) then raise exception 'Completed task counting requires an active project-member assignee'; end if;
      insert into public.productivity_attributions (
        studio_id, project_id, task_id, contributor_id, source_type, task_stage, credited_area_m2,
        completed_at, contributor_name, contributor_job_title
      ) values (
        task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', new.stage, 0,
        coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv', now()), contributor.full_name, contributor.job_title
      );
      return new;
    end if;

    if (new.stage = 'stage_2' and coalesce(new.completed_area_m2, 0) > 0)
      or (new.stage in ('stage_1', 'stage_3') and coalesce(task_project.total_area_m2, 0) > 0) then
      select * into contributor from public.profiles where id = new.assignee_id;
      if contributor.id is null or not exists (
        select 1 from public.project_members as member
        inner join public.studio_members as studio_member
          on studio_member.studio_id = task_project.studio_id
          and studio_member.user_id = new.assignee_id and studio_member.is_active
        where member.project_id = new.project_id and member.user_id = new.assignee_id
          and member.is_active and contributor.is_active
      ) then raise exception 'Attributed task completion requires an active project-member assignee'; end if;
    end if;

    snapshot_area := new.productivity_area_m2;
    if snapshot_area is null then
      if new.stage = 'stage_2' then
        snapshot_area := coalesce(new.completed_area_m2, 0);
      elsif new.stage in ('stage_1', 'stage_3') then
        insert into public.project_stage_productivity_budgets (project_id, stage, project_area_m2, productivity_budget_m2)
        select new.project_id, new.stage, greatest(coalesce(project.total_area_m2, 0), 0),
          greatest(coalesce(project.total_area_m2, 0), 0) * private.productivity_stage_ratio(new.stage)
        from public.projects as project where project.id = new.project_id
        on conflict (project_id, stage) do nothing;
        select * into stage_budget from public.project_stage_productivity_budgets
        where project_id = new.project_id and stage = new.stage for update;
        select count(*) into remaining_tasks from public.tasks as task
        where task.project_id = new.project_id and task.stage = new.stage
          and task.status <> 'cancelled' and task.productivity_area_m2 is null;
        snapshot_area := case when remaining_tasks > 0
          then greatest(stage_budget.productivity_budget_m2 - stage_budget.allocated_productivity_m2, 0) / remaining_tasks
          else 0 end;
        update public.project_stage_productivity_budgets
        set allocated_productivity_m2 = allocated_productivity_m2 + snapshot_area
        where project_id = new.project_id and stage = new.stage;
      else
        snapshot_area := 0;
      end if;
      update public.tasks set productivity_area_m2 = snapshot_area where id = new.id;
    end if;

    if snapshot_area <= 0 then return new; end if;
    insert into public.productivity_attributions (
      studio_id, project_id, task_id, contributor_id, source_type, task_stage, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    ) values (
      task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', new.stage, snapshot_area,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv', now()), contributor.full_name, contributor.job_title
    );
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions set voided_at = now()
    where task_id = old.id and source_type = 'task' and voided_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_task_productivity_attribution()
from public, anon, authenticated;

update public.tasks set productivity_area_m2 = null where stage = 'stage_4';

insert into public.productivity_attributions (
  studio_id, project_id, task_id, contributor_id, source_type, task_stage, credited_area_m2,
  completed_at, contributor_name, contributor_job_title
)
select project.studio_id, task.project_id, task.id, task.assignee_id, 'task', task.stage, 0,
  coalesce(task.completed_at::timestamp at time zone 'Europe/Kyiv', task.created_at),
  profile.full_name, profile.job_title
from public.tasks as task
inner join public.projects as project on project.id = task.project_id
inner join public.profiles as profile on profile.id = task.assignee_id and profile.is_active
inner join public.project_members as member
  on member.project_id = task.project_id and member.user_id = task.assignee_id and member.is_active
inner join public.studio_members as studio_member
  on studio_member.studio_id = project.studio_id and studio_member.user_id = task.assignee_id and studio_member.is_active
where task.status = 'completed' and task.stage = 'stage_4'
  and not exists (
    select 1 from public.productivity_attributions as attribution
    where attribution.task_id = task.id and attribution.source_type = 'task' and attribution.voided_at is null
  );

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
  if not private.is_active_project_task_assignee(p_project_id, p_assignee_id) then
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
