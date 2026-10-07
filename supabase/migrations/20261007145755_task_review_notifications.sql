alter type public.notification_type add value if not exists 'task_review_requested';

-- Review rounds are authored only by the guarded workflow. Keeping delivery on
-- the round also covers submissions through ordinary status updates and ensures
-- a failed transition rolls back its notification with the source transaction.
create function private.notify_task_review_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
  project_name text;
  project_studio_id uuid;
begin
  if new.completed_at is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.reviewer_id is not distinct from old.reviewer_id then return new; end if;
  end if;

  select task.title, project.name, project.studio_id
  into task_title, project_name, project_studio_id
  from public.tasks as task
  join public.projects as project on project.id = task.project_id
  where task.id = new.task_id;

  perform private.create_notification(
    'task_review_requested', project_studio_id, new.reviewer_id, (select auth.uid()),
    'Task ready for your review',
    'Review #' || new.round_number || ': “' || task_title || '” in ' || project_name || ' is waiting for your review.',
    '/projects/' || new.project_id || '?task=' || new.task_id,
    'task', new.task_id,
    jsonb_build_object('subject', task_title, 'projectName', project_name,
      'roundId', new.id, 'roundNumber', new.round_number)
  );
  return new;
end;
$$;

revoke execute on function private.notify_task_review_requested() from public, anon, authenticated;

create trigger notify_task_review_requested_after_write
after insert or update of reviewer_id on public.task_review_rounds
for each row execute function private.notify_task_review_requested();
