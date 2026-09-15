-- A historical completion-date correction must keep completed production work
-- inside the project's authoritative completion boundary. The privileged
-- trigger is required because completed Stage 1-3 tasks are otherwise read-only.
create or replace function private.clamp_project_task_completion_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'completed'
    and new.status = 'completed'
    and old.completed_at is not null
    and new.completed_at is not null
    and new.completed_at < old.completed_at then
    if not coalesce(private.is_studio_admin(new.studio_id), false) then
      raise exception 'Only administrators may edit project completion dates';
    end if;

    update public.tasks as task
    set completed_at = new.completed_at
    where task.project_id = new.id
      and private.is_project_progress_stage(task.stage)
      and task.status = 'completed'
      and task.completed_at > new.completed_at;
  end if;

  return new;
end;
$$;

revoke execute on function private.clamp_project_task_completion_dates()
from public, anon, authenticated;

create trigger clamp_project_task_completion_dates_after_update
after update of completed_at on public.projects
for each row
when (old.completed_at is distinct from new.completed_at)
execute function private.clamp_project_task_completion_dates();
