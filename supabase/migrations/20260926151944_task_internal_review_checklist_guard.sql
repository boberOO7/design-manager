-- The task trigger guards every status update path, including bulk moves.
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
  elsif new.status in ('internal_review', 'completed')
    and new.status is distinct from old.status
    and exists (
      select 1 from public.task_checklist_items as item
      where item.task_id = old.id and not item.is_completed and not item.is_not_needed
    ) then
    raise exception 'Complete every checklist item before moving this task to Internal Review or Done';
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

