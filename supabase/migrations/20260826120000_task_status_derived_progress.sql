-- Status-derived progress needs to distinguish a real manual production
-- override from the automatic workflow value. The previous schema stored only
-- the production number, so it could not preserve a manual value on rework.
alter table public.tasks
  add column manual_progress_override boolean not null default false;

-- The old in-progress number was always the stored manual fallback. Preserve
-- it for existing work; tasks moved after this migration receive workflow
-- values through the trigger below.
update public.tasks
set manual_progress_override = true
where status = 'in_progress';

grant update (production_completion, manual_progress_override)
on table public.tasks to authenticated;

create or replace function private.enforce_task_progress_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    update public.task_checklist_items
    set is_completed = true
    where task_id = old.id and not is_completed;
  elsif new.status = 'completed'
    and exists (
      select 1 from public.task_checklist_items as item
      where item.task_id = old.id and not item.is_completed
    ) then
    raise exception 'Complete every checklist item before moving this task to done';
  end if;

  if new.status is distinct from old.status
    and new.status = 'in_progress'
    and not old.manual_progress_override then
    -- In progress is the only target whose automatic value depends on where
    -- the task came from. All other columns are calculated from their status.
    new.production_completion := case
      when old.status in ('internal_review', 'review', 'completed') then 70
      else 50
    end;
    new.manual_progress_override := false;
  elsif (new.production_completion is distinct from old.production_completion
      or new.manual_progress_override is distinct from old.manual_progress_override)
    and new.status <> 'in_progress' then
    raise exception 'Manual production completion is editable only while a task is in progress';
  end if;

  return new;
end;
$$;
