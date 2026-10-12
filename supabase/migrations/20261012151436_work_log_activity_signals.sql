-- Preserve activity history, but distinguish progress from administrative details.
create or replace function private.log_task_work_interaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_id uuid; project_id uuid; studio_id uuid; changes jsonb;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'task_checklist_items' then
    if tg_op = 'UPDATE' and new.title = old.title and new.is_completed = old.is_completed
      and new.is_not_needed = old.is_not_needed and new.weight = old.weight then return null; end if;
    task_id := coalesce(new.task_id, old.task_id);
    changes := jsonb_build_object('checklist_item', coalesce(new.id, old.id), 'operation', tg_op);
    -- Setup, renaming, weighting and removal are not evidence of production work.
    if tg_op = 'UPDATE' and (new.is_completed is distinct from old.is_completed
      or new.is_not_needed is distinct from old.is_not_needed) then
      changes := changes || jsonb_build_object('checklist_progress', jsonb_build_object(
        'is_completed', jsonb_build_object('from', old.is_completed, 'to', new.is_completed),
        'is_not_needed', jsonb_build_object('from', old.is_not_needed, 'to', new.is_not_needed)));
    end if;
  else
    if new.title is not distinct from old.title and new.description is not distinct from old.description
      and new.production_completion is not distinct from old.production_completion then return null; end if;
    task_id := new.id;
    changes := jsonb_build_object('work_details_updated', true);
    if new.production_completion is distinct from old.production_completion then
      changes := changes || jsonb_build_object('production_completion',
        jsonb_build_object('from', old.production_completion, 'to', new.production_completion));
    end if;
  end if;
  select t.project_id, p.studio_id into project_id, studio_id
  from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id;
  if project_id is not null then
    perform private.record_project_activity(studio_id, project_id, 'task_updated', 'task', task_id, changes);
  end if;
  return null;
end;
$$;
revoke all on function private.log_task_work_interaction() from public, anon, authenticated;

-- Approval timestamps identify the assigned reviewer, not necessarily the actor.
-- Record actual decisions for future suggestions; never backfill inferred work.
create function private.log_review_work_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare review_round uuid; project_id uuid; task_id uuid; studio_id uuid; decision text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'task_review_round_reviewers' then
    if new.approved_at is null or new.approved_at is not distinct from old.approved_at then return null; end if;
    review_round := new.round_id;
    decision := 'approved';
  else
    if new.result is distinct from 'rework' or new.completed_at is null
      or new.completed_at is not distinct from old.completed_at then return null; end if;
    review_round := new.id;
    decision := 'rework';
  end if;
  select r.project_id, r.task_id, p.studio_id into project_id, task_id, studio_id
    from public.task_review_rounds r join public.projects p on p.id = r.project_id where r.id = review_round;
  perform private.record_project_activity(studio_id, project_id, 'task_updated', 'task', task_id,
    jsonb_build_object('review_round_id', review_round, 'review_action', decision));
  return null;
end;
$$;
revoke all on function private.log_review_work_activity() from public, anon, authenticated;
create trigger log_review_approval_work after update of approved_at on public.task_review_round_reviewers
  for each row execute function private.log_review_work_activity();
create trigger log_review_rework_work after update of completed_at on public.task_review_rounds
  for each row execute function private.log_review_work_activity();
