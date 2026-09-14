-- Keep the lifecycle-owned completion date authoritative while allowing an
-- administrator to correct that date without replaying a lifecycle transition.
create or replace function private.validate_project_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_task_count integer;
  has_progressed_eligible_task boolean;
  is_completion_date_only_edit boolean;
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

  is_completion_date_only_edit := old.status = 'completed'
    and new.status = 'completed'
    and new.completed_at is not null
    and new.completed_at is distinct from old.completed_at
    and (to_jsonb(new) - array['completed_at', 'updated_at']) = (to_jsonb(old) - array['completed_at', 'updated_at']);
  if is_completion_date_only_edit then
    if not coalesce(private.is_studio_admin(old.studio_id), false) then
      raise exception 'Only administrators may edit project completion dates';
    end if;
    if new.completed_at > current_date then
      raise exception 'Project completion date cannot be in the future';
    end if;
    return new;
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
