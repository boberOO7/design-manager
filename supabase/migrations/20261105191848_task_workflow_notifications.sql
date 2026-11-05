alter type public.notification_type add value if not exists 'task_review_approved';
alter type public.notification_type add value if not exists 'task_rework_requested';
alter type public.notification_type add value if not exists 'task_completed';

-- Reuse assignment recipients: the task's executor/collaborators, or the
-- correction's own executor. The shared helper excludes actors/inactive members.
create function private.notify_task_workflow(
  p_task_id uuid, p_type public.notification_type, p_metadata jsonb,
  p_correction_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task public.tasks%rowtype;
  project public.projects%rowtype;
  recipient uuid;
  title text;
begin
  select * into task from public.tasks where id = p_task_id;
  select * into project from public.projects where id = task.project_id;
  title := case p_type
    when 'task_review_approved' then 'Task review approved'
    when 'task_rework_requested' then 'Task returned for changes'
    when 'task_completed' then 'Task completed'
  end;
  for recipient in
    select task.assignee_id where p_correction_id is null
    union select c.user_id from public.task_collaborators c where c.task_id = task.id and p_correction_id is null
    union select c.assignee_id from public.task_corrections c where c.id = p_correction_id and c.task_id = task.id
  loop
    if not private.is_active_project_task_assignee(task.project_id, recipient)
      and not exists(select 1 from public.studio_members where studio_id=project.studio_id
        and user_id=recipient and is_active and system_role='admin') then continue; end if;
    perform private.create_notification(p_type, project.studio_id, recipient, auth.uid(),
      title, title || ': “' || task.title || '” in ' || project.name || '.',
      '/projects/' || project.id || '?task=' || task.id, 'task', task.id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'subject', task.title, 'projectName', project.name, 'correctionId', p_correction_id)));
  end loop;
end;
$$;
revoke all on function private.notify_task_workflow(uuid,public.notification_type,jsonb,uuid) from public,anon,authenticated;

-- Each approval is a distinct step, including approvals in later review rounds.
-- Invalid/stale retries never update approved_at, so they cannot send twice.
create function private.notify_task_review_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare round public.task_review_rounds%rowtype;
begin
  if old.approved_at is not null or new.approved_at is null then return new; end if;
  select * into round from public.task_review_rounds where id = new.round_id;
  perform private.notify_task_workflow(round.task_id, 'task_review_approved',
    jsonb_build_object('roundId', round.id, 'roundNumber', round.round_number,
      'reviewerId', new.reviewer_id, 'isFinal', not exists(
        select 1 from public.task_review_round_reviewers where round_id = round.id and approved_at is null)),
    round.correction_id);
  return new;
end;
$$;
revoke all on function private.notify_task_review_approved() from public,anon,authenticated;
create trigger notify_task_review_approved after update of approved_at on public.task_review_round_reviewers
  for each row execute function private.notify_task_review_approved();

create function private.notify_task_review_rework() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.completed_at is null and new.completed_at is not null and new.result = 'rework' then
    perform private.notify_task_workflow(new.task_id, 'task_rework_requested',
      jsonb_build_object('roundId', new.id, 'roundNumber', new.round_number,
        'reviewerId', new.reviewer_id, 'comment', left(new.rework_comment, 500)), new.correction_id);
  end if;
  return new;
end;
$$;
revoke all on function private.notify_task_review_rework() from public,anon,authenticated;
create trigger notify_task_review_rework after update of completed_at on public.task_review_rounds
  for each row execute function private.notify_task_review_rework();

-- Client review and workflows without a reviewer round still have outcomes.
-- Round-backed internal review outcomes are emitted by the two triggers above.
create function private.notify_task_status_outcome() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_id uuid; correction_id uuid; event_type public.notification_type;
begin
  if new.status is not distinct from old.status then return new; end if;
  if tg_table_name = 'task_corrections' then
    task_id := new.task_id; correction_id := new.id;
    if old.status = 'internal_review' then return new; end if;
  else
    task_id := new.id;
    if old.status = 'internal_review' and old.requires_review then return new; end if;
  end if;
  if new.status in ('todo','in_progress') and old.status in ('internal_review','review','completed') then
    event_type := 'task_rework_requested';
  elsif old.status = 'internal_review' and new.status in ('review','completed') then
    event_type := 'task_review_approved';
  elsif new.status::text in ('completed','closed') then
    event_type := 'task_completed';
  else return new;
  end if;
  perform private.notify_task_workflow(task_id, event_type,
    jsonb_build_object('fromStatus', old.status, 'status', new.status, 'isFinal', true), correction_id);
  return new;
end;
$$;
revoke all on function private.notify_task_status_outcome() from public,anon,authenticated;
create trigger notify_task_status_outcome after update of status on public.tasks
  for each row execute function private.notify_task_status_outcome();
create trigger notify_correction_status_outcome after update of status on public.task_corrections
  for each row execute function private.notify_task_status_outcome();

-- Preserve the full correction audit, but don't label every status/details
-- update as a new assignment. Review outcomes have their own messages now.
create or replace function private.audit_task_correction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare project public.projects%rowtype; changes jsonb; task_title text;
begin
  select p.* into project from public.projects p join public.tasks t on t.project_id=p.id where t.id=new.task_id;
  select title into task_title from public.tasks where id=new.task_id;
  changes:=jsonb_build_object('from',case when tg_op='UPDATE' then to_jsonb(old) else null end,'to',to_jsonb(new));
  insert into public.task_correction_events(correction_id,actor_id,changes) values(new.id,auth.uid(),changes);
  perform private.record_project_activity(project.studio_id,project.id,'task_updated','task',new.task_id,
    jsonb_build_object('correction_id',new.id,'correction',changes));
  if tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id then
    perform private.create_notification('task_assigned',project.studio_id,new.assignee_id,auth.uid(),
      'Task correction',new.description,'/projects/'||project.id||'?task='||new.task_id,'task',new.task_id,
      jsonb_build_object('correctionId',new.id,'subject',task_title,'projectName',project.name));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_task_correction() from public,anon,authenticated;

create or replace function private.notify_task_review_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_title text; project_name text; project_studio_id uuid;
begin
  if new.completed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.reviewer_id is not distinct from old.reviewer_id then return new; end if;
  select task.title, project.name, project.studio_id into task_title, project_name, project_studio_id
    from public.tasks task join public.projects project on project.id = task.project_id where task.id = new.task_id;
  perform private.create_notification('task_review_requested', project_studio_id, new.reviewer_id, auth.uid(),
    'Task ready for your review',
    'Review #' || new.round_number || ': “' || task_title || '” in ' || project_name || ' is waiting for your review.',
    '/projects/' || new.project_id || '?task=' || new.task_id, 'task', new.task_id,
    jsonb_strip_nulls(jsonb_build_object('subject', task_title, 'projectName', project_name,
      'roundId', new.id, 'roundNumber', new.round_number, 'correctionId', new.correction_id)));
  return new;
end;
$$;
revoke all on function private.notify_task_review_requested() from public,anon,authenticated;
