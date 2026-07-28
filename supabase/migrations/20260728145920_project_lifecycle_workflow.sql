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

  if new.status is not distinct from old.status
    and new.archived_at is not distinct from old.archived_at then
    if old.status = 'archived' then
      raise exception 'Archived projects are read-only';
    end if;
    if old.status = 'completed' then
      raise exception 'Completed projects are read-only until reopened';
    end if;
    if new.completed_at is distinct from old.completed_at then
      raise exception 'Completion date is managed through lifecycle transitions';
    end if;
    return new;
  end if;

  if new.status = 'archived' then
    if new.completed_at is distinct from old.completed_at then
      raise exception 'Archiving must preserve the completion date';
    end if;
    return new;
  end if;

  if old.status = 'archived' then
    if new.archived_at is not null
      or new.status is distinct from (
        case when old.completed_at is not null then 'completed' else 'paused' end
      )
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

  if old.status = 'planned' and new.status = 'active' then
    return new;
  end if;
  if old.status = 'active' and new.status = 'paused' then
    return new;
  end if;
  if old.status = 'paused' and new.status = 'active' then
    return new;
  end if;
  if old.status = 'completed' and new.status = 'active' then
    new.completed_at := null;
    return new;
  end if;

  if old.status = 'paused' and new.status = 'planned' then
    select exists (
      select 1 from public.tasks as task
      where task.project_id = old.id
        and task.status <> 'cancelled'
        and task.status <> 'todo'
    ) into has_progressed_eligible_task;
    if not has_progressed_eligible_task then return new; end if;
    raise exception 'A paused project can return to planned only when eligible tasks are still to do';
  end if;

  if old.status in ('active', 'paused') and new.status = 'completed' then
    select count(*) into open_task_count
    from public.tasks as task
    where task.project_id = old.id
      and task.status not in ('completed', 'cancelled');
    if open_task_count = 0 then
      new.completed_at := current_date;
      return new;
    end if;
    raise exception 'A project with open tasks cannot be completed';
  end if;

  raise exception 'Invalid project lifecycle transition';
end;
$$;

revoke execute on function private.validate_project_lifecycle_transition()
from public, anon, authenticated;

create trigger validate_project_lifecycle_transition_before_update
before update on public.projects
for each row execute function private.validate_project_lifecycle_transition();

create or replace function private.activate_planned_project_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('in_progress', 'review', 'completed') then
    update public.projects
    set status = 'active'
    where id = new.project_id
      and status = 'planned'
      and archived_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.activate_planned_project_from_task()
from public, anon, authenticated;

create trigger activate_planned_project_after_task_status_change
after update of status on public.tasks
for each row execute function private.activate_planned_project_from_task();

create or replace function private.can_create_project_task(
  target_project_id uuid,
  target_assignee_id uuid
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
    inner join public.project_members as assignment
      on assignment.project_id = project.id
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project.studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee
      on assignee.id = assignment.user_id
    where project.id = target_project_id
      and project.archived_at is null
      and project.status in ('planned', 'active', 'paused')
      and assignment.user_id = target_assignee_id
      and assignment.is_active = true
      and studio_member.is_active = true
      and assignee.is_active = true
      and private.is_studio_admin(project.studio_id)
  );
$$;

revoke execute on function private.can_create_project_task(uuid, uuid)
from public, anon;
grant execute on function private.can_create_project_task(uuid, uuid) to authenticated;

create or replace function private.can_update_project_task_status(
  target_project_id uuid,
  target_assignee_id uuid
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
      and project.status in ('planned', 'active', 'paused')
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
        and project.status in ('planned', 'active', 'paused')
        and assignment.user_id = target_assignee_id
        and assignment.is_active = true
        and studio_member.is_active = true
        and assignee.is_active = true
    )
  );
$$;

revoke execute on function private.can_update_project_task_status(uuid, uuid)
from public, anon;
grant execute on function private.can_update_project_task_status(uuid, uuid) to authenticated;

drop policy if exists "tasks_update_status_for_admins_and_assignees" on public.tasks;
create policy "tasks_update_status_for_admins_and_assignees"
on public.tasks for update to authenticated
using ((select private.can_update_project_task_status(project_id, assignee_id)))
with check (
  (select private.can_update_project_task_status(project_id, assignee_id))
  and status in ('todo', 'in_progress', 'completed')
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

  if project_status is null or project_status = 'archived' then
    raise exception 'Archived projects are read-only';
  end if;
  if project_status = 'completed' then
    raise exception 'Completed projects are read-only until reopened';
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
  ) then raise exception 'Only administrators may edit task details'; end if;
  if is_admin and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_task_edit_permissions()
from public, anon, authenticated;
